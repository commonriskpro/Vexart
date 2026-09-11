// native/libvexart/src/text/atlas.rs
// AtlasRecord and AtlasRegistry: GPU texture loading for MSDF atlas pages.
// Per design §4.3, REQ-2B-202, task 4.2.

use std::collections::HashMap;

/// One loaded MSDF (or SDF/bitmap) atlas on the GPU.
pub struct AtlasRecord {
    /// GPU texture (RGBA8Unorm, 1024×1024).
    pub texture: wgpu::Texture,
    /// Default view over the full texture.
    pub view: wgpu::TextureView,
    /// Bind group for the atlas texture + sampler (using image_bind_group_layout).
    pub bind_group: wgpu::BindGroup,
    /// Atlas pixel width.
    pub width: u32,
    /// Atlas pixel height.
    pub height: u32,
}

/// Registry keyed by font_id (1-15, matching existing AGENTS.md spec).
pub struct AtlasRegistry {
    records: HashMap<u32, AtlasRecord>,
}

impl AtlasRegistry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self {
            records: HashMap::new(),
        }
    }

    /// Load raw RGBA bytes directly as an atlas (no PNG decode, no metrics JSON).
    /// Used by the MSDF pipeline which generates atlas pages at runtime.
    /// Unlike `load_atlas`, this replaces an existing atlas (upsert semantics)
    /// and does not require metrics — the caller manages glyph lookup.
    pub fn load_atlas_raw(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        image_bgl: &wgpu::BindGroupLayout,
        font_id: u32,
        rgba: &[u8],
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        if font_id == 0 || font_id > 15 {
            return Err(format!("font_id {font_id} out of range; must be 1-15"));
        }

        // If atlas already exists with matching dimensions, update in-place without reallocation.
        if let Some(record) = self.records.get_mut(&font_id) {
            if record.width == width && record.height == height {
                queue.write_texture(
                    wgpu::TexelCopyTextureInfo {
                        texture: &record.texture,
                        mip_level: 0,
                        origin: wgpu::Origin3d::ZERO,
                        aspect: wgpu::TextureAspect::All,
                    },
                    rgba,
                    wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(width * 4),
                        rows_per_image: Some(height),
                    },
                    wgpu::Extent3d {
                        width,
                        height,
                        depth_or_array_layers: 1,
                    },
                );
                return Ok(());
            }
        }

        // Remove existing atlas if present (upsert with different dimensions).
        self.records.remove(&font_id);

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(&format!("vexart-msdf-atlas-{font_id}")),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            rgba,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 4),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some(&format!("vexart-msdf-atlas-sampler-{font_id}")),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(&format!("vexart-msdf-atlas-bind-group-{font_id}")),
            layout: image_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });

        self.records.insert(
            font_id,
            AtlasRecord {
                texture,
                view,
                bind_group,
                width,
                height,
            },
        );

        Ok(())
    }

    /// Update a subregion of an existing MSDF atlas page directly via queue.write_texture.
    ///
    /// - `origin_x`, `origin_y`: top-left corner in the atlas texture (texels).
    /// - `width`, `height`: dimensions of the subregion to update (texels).
    /// - `data`: byte buffer containing pixel data (e.g. the full atlas page RGBA buffer).
    /// - `bytes_per_row`: stride in bytes per row in `data` (e.g. PAGE_SIZE * 4).
    /// - `offset`: start offset in bytes into `data` where this subregion begins.
    pub fn update_subregion(
        &self,
        queue: &wgpu::Queue,
        font_id: u32,
        origin_x: u32,
        origin_y: u32,
        width: u32,
        height: u32,
        data: &[u8],
        bytes_per_row: u32,
        offset: u64,
    ) -> Result<(), String> {
        if font_id == 0 || font_id > 15 {
            return Err(format!("font_id {font_id} out of range; must be 1-15"));
        }

        let record = self
            .records
            .get(&font_id)
            .ok_or_else(|| format!("font_id {font_id} not loaded"))?;

        if width == 0 || height == 0 {
            return Err("subregion width and height must be non-zero".to_string());
        }

        let max_x = origin_x
            .checked_add(width)
            .ok_or_else(|| "subregion x bounds overflow".to_string())?;
        let max_y = origin_y
            .checked_add(height)
            .ok_or_else(|| "subregion y bounds overflow".to_string())?;

        if max_x > record.width || max_y > record.height {
            return Err(format!(
                "subregion (origin=({}, {}), size=({}, {})) exceeds atlas bounds ({}x{})",
                origin_x, origin_y, width, height, record.width, record.height
            ));
        }

        let row_bytes = (width as u64)
            .checked_mul(4)
            .ok_or_else(|| "subregion row bytes overflow".to_string())?;
        if (bytes_per_row as u64) < row_bytes && height > 1 {
            return Err(format!(
                "bytes_per_row ({bytes_per_row}) must be at least row width in bytes ({row_bytes})"
            ));
        }

        let last_row_offset = ((height - 1) as u64)
            .checked_mul(bytes_per_row as u64)
            .and_then(|h_offset| offset.checked_add(h_offset))
            .ok_or_else(|| "subregion buffer offset calculation overflow".to_string())?;
        let required_len = last_row_offset
            .checked_add(row_bytes)
            .ok_or_else(|| "subregion buffer end calculation overflow".to_string())?;

        if (data.len() as u64) < required_len {
            return Err(format!(
                "subregion buffer too small: required {required_len} bytes, got {}",
                data.len()
            ));
        }

        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &record.texture,
                mip_level: 0,
                origin: wgpu::Origin3d {
                    x: origin_x,
                    y: origin_y,
                    z: 0,
                },
                aspect: wgpu::TextureAspect::All,
            },
            data,
            wgpu::TexelCopyBufferLayout {
                offset,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        Ok(())
    }

    /// Look up a loaded atlas by font_id. Returns `None` if not yet loaded.
    pub fn get(&self, font_id: u32) -> Option<&AtlasRecord> {
        self.records.get(&font_id)
    }

    /// Returns true if font_id is already loaded.
    pub fn contains(&self, font_id: u32) -> bool {
        self.records.contains_key(&font_id)
    }

    /// Remove and drop the GPU resources for font_id.
    pub fn remove(&mut self, font_id: u32) {
        self.records.remove(&font_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atlas_registry_new_is_empty() {
        let reg = AtlasRegistry::new();
        assert!(!reg.contains(1));
        assert!(reg.get(1).is_none());
    }

    #[test]
    fn test_atlas_registry_invalid_font_id_zero() {
        let reg = AtlasRegistry::new();
        assert!(!reg.contains(0));
        assert!(reg.get(0).is_none());
    }

    #[test]
    fn test_update_subregion_validation() {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::empty(),
            backend_options: wgpu::BackendOptions::default(),
            memory_budget_thresholds: Default::default(),
            display: Default::default(),
        });
        let adapter = match pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::default(),
            compatible_surface: None,
            force_fallback_adapter: false,
        })) {
            Ok(a) => a,
            Err(_) => return,
        };
        let (device, queue) = match pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("test"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            memory_hints: wgpu::MemoryHints::Performance,
            trace: wgpu::Trace::Off,
            experimental_features: Default::default(),
        })) {
            Ok(pair) => pair,
            Err(_) => return,
        };

        let image_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("test-bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let mut reg = AtlasRegistry::new();
        let atlas_w = 64u32;
        let atlas_h = 64u32;
        let initial_rgba = vec![0u8; (atlas_w * atlas_h * 4) as usize];

        // 1. font_id = 0 fails
        assert!(reg
            .update_subregion(&queue, 0, 0, 0, 16, 16, &initial_rgba, atlas_w * 4, 0)
            .is_err());

        // 2. font_id > 15 fails
        assert!(reg
            .update_subregion(&queue, 16, 0, 0, 16, 16, &initial_rgba, atlas_w * 4, 0)
            .is_err());

        // 3. font_id not yet loaded fails
        assert!(reg
            .update_subregion(&queue, 1, 0, 0, 16, 16, &initial_rgba, atlas_w * 4, 0)
            .is_err());

        // Load atlas
        let load_res = reg.load_atlas_raw(
            &device,
            &queue,
            &image_bgl,
            1,
            &initial_rgba,
            atlas_w,
            atlas_h,
        );
        assert!(load_res.is_ok());
        assert!(reg.contains(1));

        // 4. Zero width or height fails
        assert!(reg
            .update_subregion(&queue, 1, 0, 0, 0, 16, &initial_rgba, atlas_w * 4, 0)
            .is_err());
        assert!(reg
            .update_subregion(&queue, 1, 0, 0, 16, 0, &initial_rgba, atlas_w * 4, 0)
            .is_err());

        // 5. Out of bounds X fails
        assert!(reg
            .update_subregion(&queue, 1, 50, 0, 20, 16, &initial_rgba, atlas_w * 4, 0)
            .is_err());

        // 6. Out of bounds Y fails
        assert!(reg
            .update_subregion(&queue, 1, 0, 50, 16, 20, &initial_rgba, atlas_w * 4, 0)
            .is_err());

        // 7. Buffer too small fails
        let small_buf = vec![0u8; 10];
        assert!(reg
            .update_subregion(&queue, 1, 0, 0, 16, 16, &small_buf, atlas_w * 4, 0)
            .is_err());

        // 8. Valid subregion update succeeds
        let valid_sub = vec![128u8; (16 * 16 * 4) as usize];
        let res = reg.update_subregion(&queue, 1, 8, 8, 16, 16, &valid_sub, 16 * 4, 0);
        assert!(res.is_ok());

        // 9. Re-calling load_atlas_raw with same dimensions updates in-place
        let reload_res = reg.load_atlas_raw(
            &device,
            &queue,
            &image_bgl,
            1,
            &initial_rgba,
            atlas_w,
            atlas_h,
        );
        assert!(reload_res.is_ok());
    }
}
