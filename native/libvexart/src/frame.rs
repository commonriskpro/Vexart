#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeFrameStrategy {
    SkipPresent,
    LayeredDirty,
    LayeredRegion,
    FinalFrame,
}

impl NativeFrameStrategy {
    pub const NONE: u32 = u32::MAX;
    pub const SKIP_PRESENT: u32 = 0;
    pub const LAYERED_DIRTY: u32 = 1;
    pub const LAYERED_REGION: u32 = 2;
    pub const FINAL_FRAME: u32 = 3;

    pub fn as_u32(self) -> u32 {
        match self {
            Self::SkipPresent => Self::SKIP_PRESENT,
            Self::LayeredDirty => Self::LAYERED_DIRTY,
            Self::LayeredRegion => Self::LAYERED_REGION,
            Self::FinalFrame => Self::FINAL_FRAME,
        }
    }

    pub fn from_u32(value: u32) -> Option<Self> {
        match value {
            Self::SKIP_PRESENT => Some(Self::SkipPresent),
            Self::LAYERED_DIRTY => Some(Self::LayeredDirty),
            Self::LAYERED_REGION => Some(Self::LayeredRegion),
            Self::FINAL_FRAME => Some(Self::FinalFrame),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NativeFramePlanInput {
    pub dirty_layer_count: u32,
    pub dirty_pixel_area: u64,
    pub total_pixel_area: u64,
    pub overlap_pixel_area: u64,
    pub overlap_ratio: f32,
    pub full_repaint: bool,
    pub has_subtree_transforms: bool,
    pub has_active_interaction: bool,
    pub transmission_mode: u32,
    pub last_strategy: u32,
    pub frames_since_change: u32,
    pub estimated_layered_bytes: u64,
    pub estimated_final_bytes: u64,
}

impl NativeFramePlanInput {
    pub const VERSION: u32 = 1;
    pub const BYTE_LEN: usize = 76;
    pub const TRANSPORT_DIRECT: u32 = 0;
    pub const TRANSPORT_FILE: u32 = 1;
    pub const TRANSPORT_SHM: u32 = 2;

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::BYTE_LEN {
            return None;
        }
        let version = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        if version != Self::VERSION {
            return None;
        }
        Some(Self {
            dirty_layer_count: u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
            dirty_pixel_area: u64::from_le_bytes([
                bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
            ]),
            total_pixel_area: u64::from_le_bytes([
                bytes[16], bytes[17], bytes[18], bytes[19], bytes[20], bytes[21], bytes[22], bytes[23],
            ]),
            overlap_pixel_area: u64::from_le_bytes([
                bytes[24], bytes[25], bytes[26], bytes[27], bytes[28], bytes[29], bytes[30], bytes[31],
            ]),
            overlap_ratio: f32::from_le_bytes([bytes[32], bytes[33], bytes[34], bytes[35]]),
            full_repaint: u32::from_le_bytes([bytes[36], bytes[37], bytes[38], bytes[39]]) != 0,
            has_subtree_transforms: u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]) != 0,
            has_active_interaction: u32::from_le_bytes([bytes[44], bytes[45], bytes[46], bytes[47]]) != 0,
            transmission_mode: u32::from_le_bytes([bytes[48], bytes[49], bytes[50], bytes[51]]),
            last_strategy: u32::from_le_bytes([bytes[52], bytes[53], bytes[54], bytes[55]]),
            frames_since_change: u32::from_le_bytes([bytes[56], bytes[57], bytes[58], bytes[59]]),
            estimated_layered_bytes: u64::from_le_bytes([
                bytes[60], bytes[61], bytes[62], bytes[63], bytes[64], bytes[65], bytes[66], bytes[67],
            ]),
            estimated_final_bytes: u64::from_le_bytes([
                bytes[68], bytes[69], bytes[70], bytes[71], bytes[72], bytes[73], bytes[74], bytes[75],
            ]),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeFramePlan {
    pub strategy: NativeFrameStrategy,
    pub reason_flags: u32,
}

impl NativeFramePlan {
    pub const VERSION: u32 = 1;
    pub const BYTE_LEN: usize = 12;
    pub const REASON_NO_DAMAGE: u32 = 1 << 0;
    pub const REASON_TRANSFORMS: u32 = 1 << 1;
    pub const REASON_FULL_REPAINT: u32 = 1 << 2;
    pub const REASON_ACTIVE_INTERACTION: u32 = 1 << 3;
    pub const REASON_REGION_CANDIDATE: u32 = 1 << 4;
    pub const REASON_LAYERED_CANDIDATE: u32 = 1 << 5;
    pub const REASON_BYTES_FAVOR_LAYERED: u32 = 1 << 6;
    pub const REASON_HYSTERESIS_HELD: u32 = 1 << 7;

    pub fn write_to(self, out: &mut [u8]) -> bool {
        if out.len() < Self::BYTE_LEN {
            return false;
        }
        out[0..4].copy_from_slice(&Self::VERSION.to_le_bytes());
        out[4..8].copy_from_slice(&self.strategy.as_u32().to_le_bytes());
        out[8..12].copy_from_slice(&self.reason_flags.to_le_bytes());
        true
    }
}

pub fn choose_frame_strategy(input: NativeFramePlanInput) -> NativeFramePlan {
    if input.dirty_layer_count == 0 || input.dirty_pixel_area == 0 || input.total_pixel_area == 0 {
        return NativeFramePlan {
            strategy: NativeFrameStrategy::SkipPresent,
            reason_flags: NativeFramePlan::REASON_NO_DAMAGE,
        };
    }

    if input.has_subtree_transforms {
        return NativeFramePlan {
            strategy: NativeFrameStrategy::FinalFrame,
            reason_flags: NativeFramePlan::REASON_TRANSFORMS,
        };
    }

    if input.full_repaint {
        return NativeFramePlan {
            strategy: NativeFrameStrategy::FinalFrame,
            reason_flags: NativeFramePlan::REASON_FULL_REPAINT,
        };
    }

    if input.has_active_interaction {
        return NativeFramePlan {
            strategy: NativeFrameStrategy::LayeredDirty,
            reason_flags: NativeFramePlan::REASON_ACTIVE_INTERACTION,
        };
    }

    let dirty_ratio = input.dirty_pixel_area as f64 / input.total_pixel_area as f64;
    let output_ratio = if input.estimated_final_bytes > 0 {
        input.estimated_layered_bytes as f64 / input.estimated_final_bytes as f64
    } else {
        0.0
    };

    let mut preferred = NativeFrameStrategy::FinalFrame;
    let mut reason_flags = 0;
    if input.transmission_mode == NativeFramePlanInput::TRANSPORT_SHM
        && input.dirty_layer_count <= 2
        && dirty_ratio < 0.18
        && input.overlap_ratio < 0.04
    {
        preferred = NativeFrameStrategy::LayeredRegion;
        reason_flags |= NativeFramePlan::REASON_REGION_CANDIDATE;
    } else if (input.transmission_mode == NativeFramePlanInput::TRANSPORT_DIRECT && output_ratio < 0.45)
        || (input.dirty_layer_count <= 1 && dirty_ratio < 0.45 && input.overlap_pixel_area == 0)
        || (input.dirty_layer_count <= 2 && dirty_ratio < 0.3 && input.overlap_ratio < 0.08)
        || (dirty_ratio < 0.18 && input.overlap_ratio < 0.04)
    {
        preferred = NativeFrameStrategy::LayeredDirty;
        reason_flags |= NativeFramePlan::REASON_LAYERED_CANDIDATE;
        if output_ratio < 0.45 {
            reason_flags |= NativeFramePlan::REASON_BYTES_FAVOR_LAYERED;
        }
    }

    let Some(last_strategy) = NativeFrameStrategy::from_u32(input.last_strategy) else {
        return NativeFramePlan {
            strategy: preferred,
            reason_flags,
        };
    };

    if preferred == last_strategy {
        return NativeFramePlan {
            strategy: preferred,
            reason_flags,
        };
    }

    if input.frames_since_change < 2 {
        if preferred == NativeFrameStrategy::FinalFrame && input.full_repaint {
            return NativeFramePlan {
                strategy: preferred,
                reason_flags,
            };
        }
        if preferred == NativeFrameStrategy::LayeredRegion && dirty_ratio < 0.22 && input.overlap_ratio < 0.05 {
            return NativeFramePlan {
                strategy: preferred,
                reason_flags,
            };
        }
        if preferred == NativeFrameStrategy::LayeredDirty && output_ratio < 0.42 {
            return NativeFramePlan {
                strategy: preferred,
                reason_flags,
            };
        }
        return NativeFramePlan {
            strategy: last_strategy,
            reason_flags: reason_flags | NativeFramePlan::REASON_HYSTERESIS_HELD,
        };
    }

    if preferred == NativeFrameStrategy::LayeredDirty {
        if output_ratio < 0.42 || (dirty_ratio < 0.12 && input.overlap_ratio < 0.03) {
            return NativeFramePlan {
                strategy: preferred,
                reason_flags,
            };
        }
        return NativeFramePlan {
            strategy: last_strategy,
            reason_flags: reason_flags | NativeFramePlan::REASON_HYSTERESIS_HELD,
        };
    }

    if preferred == NativeFrameStrategy::LayeredRegion {
        if dirty_ratio < 0.24 && input.overlap_ratio < 0.06 {
            return NativeFramePlan {
                strategy: preferred,
                reason_flags,
            };
        }
        return NativeFramePlan {
            strategy: last_strategy,
            reason_flags: reason_flags | NativeFramePlan::REASON_HYSTERESIS_HELD,
        };
    }

    if dirty_ratio > 0.42 || input.overlap_ratio > 0.12 || output_ratio > 0.82 {
        return NativeFramePlan {
            strategy: preferred,
            reason_flags,
        };
    }

    NativeFramePlan {
        strategy: last_strategy,
        reason_flags: reason_flags | NativeFramePlan::REASON_HYSTERESIS_HELD,
    }
}

#[cfg(test)]
mod tests {
    use super::{choose_frame_strategy, NativeFramePlan, NativeFramePlanInput, NativeFrameStrategy};

    fn input() -> NativeFramePlanInput {
        NativeFramePlanInput {
            dirty_layer_count: 1,
            dirty_pixel_area: 1_000,
            total_pixel_area: 10_000,
            overlap_pixel_area: 0,
            overlap_ratio: 0.0,
            full_repaint: false,
            has_subtree_transforms: false,
            has_active_interaction: false,
            transmission_mode: NativeFramePlanInput::TRANSPORT_SHM,
            last_strategy: NativeFrameStrategy::NONE,
            frames_since_change: 4,
            estimated_layered_bytes: 1_000,
            estimated_final_bytes: 10_000,
        }
    }

    #[test]
    fn chooses_skip_present_when_no_damage_exists() {
        let mut next = input();
        next.dirty_layer_count = 0;
        let plan = choose_frame_strategy(next);
        assert_eq!(plan.strategy, NativeFrameStrategy::SkipPresent);
        assert_eq!(plan.reason_flags, NativeFramePlan::REASON_NO_DAMAGE);
    }

    #[test]
    fn chooses_final_frame_for_transform_heavy_frames() {
        let mut next = input();
        next.has_subtree_transforms = true;
        let plan = choose_frame_strategy(next);
        assert_eq!(plan.strategy, NativeFrameStrategy::FinalFrame);
        assert_eq!(plan.reason_flags, NativeFramePlan::REASON_TRANSFORMS);
    }

    #[test]
    fn chooses_layered_region_for_small_shm_damage() {
        let plan = choose_frame_strategy(input());
        assert_eq!(plan.strategy, NativeFrameStrategy::LayeredRegion);
        assert_ne!(plan.reason_flags & NativeFramePlan::REASON_REGION_CANDIDATE, 0);
    }

    #[test]
    fn holds_previous_strategy_during_hysteresis_window() {
        let mut next = input();
        next.transmission_mode = NativeFramePlanInput::TRANSPORT_FILE;
        next.dirty_pixel_area = 8_500;
        next.overlap_ratio = 0.4;
        next.last_strategy = NativeFrameStrategy::LayeredRegion.as_u32();
        next.frames_since_change = 1;
        let plan = choose_frame_strategy(next);
        assert_eq!(plan.strategy, NativeFrameStrategy::LayeredRegion);
        assert_ne!(plan.reason_flags & NativeFramePlan::REASON_HYSTERESIS_HELD, 0);
    }
}
