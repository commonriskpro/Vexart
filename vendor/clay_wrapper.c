/**
 * Clay wrapper — thin C layer that compiles clay.h and exposes
 * simplified FFI-friendly functions for TypeScript via bun:ffi.
 *
 * Why a wrapper instead of calling Clay directly:
 *   - Clay uses complex C structs/unions that bun:ffi can't represent
 *   - We need to flatten struct params into primitive types (≤8 per call)
 *   - The wrapper hides Clay's macro-heavy API behind simple function calls
 *
 * Build: cc -shared -o libclay.dylib -DCLAY_IMPLEMENTATION clay_wrapper.c
 */

#ifndef CLAY_IMPLEMENTATION
#define CLAY_IMPLEMENTATION
#endif
#include "clay.h"

#include <stdlib.h>
#include <string.h>

/* ── Globals ────────────────────────────────────────────── */

static Clay_Context *ctx = NULL;
static void *arena_memory = NULL;

/* ── Text measurement via pre-computed lookup table ──
 *
 * TS pre-measures each text string with Pretext before calling Clay,
 * writing {width, height} pairs into a shared float buffer indexed by
 * a sequential counter. The Clay callback reads from this table.
 *
 * Flow:
 *   1. TS calls tge_clay_reset_text_measures() at frame start
 *   2. For each <Text>, TS calls tge_clay_set_text_measure(index, w, h)
 *   3. During walkTree, TS calls clay.text() which triggers Clay
 *   4. Clay calls tge_measure_text_callback which reads the table
 */

#define MAX_TEXT_MEASURES 256

static float text_measure_widths[MAX_TEXT_MEASURES];
static float text_measure_heights[MAX_TEXT_MEASURES];
static int text_measure_counter = 0;

void tge_clay_reset_text_measures(void) {
    text_measure_counter = 0;
}

void tge_clay_set_text_measure(int index, float width, float height) {
    if (index >= 0 && index < MAX_TEXT_MEASURES) {
        text_measure_widths[index] = width;
        text_measure_heights[index] = height;
    }
}

static Clay_Dimensions tge_measure_text_callback(
    Clay_StringSlice text,
    Clay_TextElementConfig *config,
    void *userData
) {
    (void)userData;
    int idx = text_measure_counter++;
    if (idx >= 0 && idx < MAX_TEXT_MEASURES && text_measure_widths[idx] > 0) {
        return (Clay_Dimensions){
            .width = text_measure_widths[idx],
            .height = text_measure_heights[idx],
        };
    }
    /* Fallback: monospace 9px per char, 17px height */
    return (Clay_Dimensions){
        .width = text.length * 9.0f,
        .height = 17.0f
    };
}

static void tge_error_handler(Clay_ErrorData error) {
    (void)error;
    /* Errors are silently ignored for now — we could log to stderr */
}

/* ── Init / Teardown ────────────────────────────────────── */

/* Initialize Clay with the given layout dimensions. Returns 1 on success. */
int tge_clay_init(float width, float height) {
    uint32_t mem_size = Clay_MinMemorySize();
    arena_memory = malloc(mem_size);
    if (!arena_memory) return 0;

    Clay_Arena arena = Clay_CreateArenaWithCapacityAndMemory(mem_size, arena_memory);
    Clay_ErrorHandler handler = { .errorHandlerFunction = tge_error_handler };
    ctx = Clay_Initialize(arena, (Clay_Dimensions){width, height}, handler);
    Clay_SetMeasureTextFunction(tge_measure_text_callback, NULL);
    return 1;
}

/* Update layout dimensions (e.g. on terminal resize). */
void tge_clay_set_dimensions(float width, float height) {
    Clay_SetLayoutDimensions((Clay_Dimensions){width, height});
}

/* Free Clay resources. */
void tge_clay_destroy(void) {
    if (arena_memory) {
        free(arena_memory);
        arena_memory = NULL;
    }
    ctx = NULL;
}

/* ── Layout Pass ────────────────────────────────────────── */

static Clay_RenderCommandArray last_commands = {0};

void tge_clay_begin_layout(void) {
    Clay_BeginLayout();
}

/*
 * End layout, compute positions, store render commands.
 * Returns the number of render commands produced.
 */
int tge_clay_end_layout(void) {
    last_commands = Clay_EndLayout(0);
    return last_commands.length;
}

/* ── Element Declaration ────────────────────────────────── */

/*
 * Clay__ConfigureOpenElement REPLACES the entire config (not additive).
 * So we accumulate the config in a static struct and flush it on close.
 */
static Clay_ElementDeclaration pending_config;
static int pending_configured;
static void tge_clay_flush_config(void);

void tge_clay_open_element(void) {
    /* Flush parent's config before opening a child */
    tge_clay_flush_config();
    Clay__OpenElement();
    memset(&pending_config, 0, sizeof(pending_config));
    pending_configured = 0;
}

/* Flush pending config — must be called before adding children or closing. */
void tge_clay_flush_config(void) {
    if (!pending_configured) {
        Clay__ConfigureOpenElement(pending_config);
        pending_configured = 1;
    }
}

void tge_clay_close_element(void) {
    tge_clay_flush_config();
    Clay__CloseElement();
}

/* Layout: direction + padding + gap + alignment */
void tge_clay_configure_layout(
    uint8_t direction,
    uint16_t padding_x,
    uint16_t padding_y,
    uint16_t child_gap,
    uint8_t align_x,
    uint8_t align_y
) {
    pending_config.layout.layoutDirection = direction;
    pending_config.layout.padding = (Clay_Padding){ .left = padding_x, .right = padding_x, .top = padding_y, .bottom = padding_y };
    pending_config.layout.childGap = child_gap;
    pending_config.layout.childAlignment = (Clay_ChildAlignment){ .x = align_x, .y = align_y };
}

/* Sizing: width + height with type */
void tge_clay_configure_sizing(
    uint8_t width_type,
    float width_value,
    uint8_t height_type,
    float height_value
) {
    Clay_SizingAxis w = {0};
    Clay_SizingAxis h = {0};

    switch (width_type) {
        case 0: w.type = CLAY__SIZING_TYPE_FIT; break;
        case 1: w.type = CLAY__SIZING_TYPE_GROW; break;
        case 2: w.type = CLAY__SIZING_TYPE_PERCENT; w.size.percent = width_value; break;
        case 3: w.type = CLAY__SIZING_TYPE_FIXED; w.size.minMax = (Clay_SizingMinMax){width_value, width_value}; break;
    }
    switch (height_type) {
        case 0: h.type = CLAY__SIZING_TYPE_FIT; break;
        case 1: h.type = CLAY__SIZING_TYPE_GROW; break;
        case 2: h.type = CLAY__SIZING_TYPE_PERCENT; h.size.percent = height_value; break;
        case 3: h.type = CLAY__SIZING_TYPE_FIXED; h.size.minMax = (Clay_SizingMinMax){height_value, height_value}; break;
    }

    pending_config.layout.sizing.width = w;
    pending_config.layout.sizing.height = h;
}

/* Background color + corner radius */
void tge_clay_configure_rectangle(uint32_t color_rgba, float radius) {
    pending_config.backgroundColor = (Clay_Color){
        .r = (color_rgba >> 24) & 0xff,
        .g = (color_rgba >> 16) & 0xff,
        .b = (color_rgba >> 8) & 0xff,
        .a = color_rgba & 0xff,
    };
    pending_config.cornerRadius = (Clay_CornerRadius){ radius, radius, radius, radius };
}

/* Border */
void tge_clay_configure_border(uint32_t color_rgba, uint16_t width_all) {
    pending_config.border.color = (Clay_Color){
        .r = (color_rgba >> 24) & 0xff,
        .g = (color_rgba >> 16) & 0xff,
        .b = (color_rgba >> 8) & 0xff,
        .a = color_rgba & 0xff,
    };
    pending_config.border.width = (Clay_BorderWidth){ width_all, width_all, width_all, width_all, width_all };
}

/* Text element — opens AND closes (leaf node) */
void tge_clay_text(const char *text, int length, uint32_t color_rgba, uint16_t font_id, uint16_t font_size) {
    Clay_String str = { .length = length, .chars = text };
    Clay__OpenTextElement(str, (Clay_TextElementConfig){
        .textColor = {
            .r = (color_rgba >> 24) & 0xff,
            .g = (color_rgba >> 16) & 0xff,
            .b = (color_rgba >> 8) & 0xff,
            .a = color_rgba & 0xff,
        },
        .fontId = font_id,
        .fontSize = font_size,
        .wrapMode = CLAY_TEXT_WRAP_WORDS,
    });
}

/* Clip / Scroll container */
void tge_clay_configure_clip(uint8_t horizontal, uint8_t vertical, float offset_x, float offset_y) {
    pending_config.clip.horizontal = horizontal != 0;
    pending_config.clip.vertical = vertical != 0;
    pending_config.clip.childOffset = (Clay_Vector2){ offset_x, offset_y };
}

/* Get the internally tracked scroll offset for the currently open element.
 * Returns x in out[0] and y in out[1]. */
void tge_clay_get_scroll_offset(float *out) {
    Clay_Vector2 offset = Clay_GetScrollOffset();
    out[0] = offset.x;
    out[1] = offset.y;
}

/* Element ID — opens a new element with the given string ID.
 * REPLACES tge_clay_open_element when an ID is needed. */
void tge_clay_set_id(const char *label, int length) {
    /* Flush parent's config before opening a child (same as open_element) */
    tge_clay_flush_config();
    Clay_String str = { .length = length, .chars = label };
    Clay_ElementId id = Clay__HashString(str, 0);
    Clay__OpenElementWithId(id);
    memset(&pending_config, 0, sizeof(pending_config));
    pending_configured = 0;
}

/* ── Render Command Readback ────────────────────────────── */

/*
 * Render commands are read back into a flat float buffer.
 * For each command, we write a fixed-size record:
 *
 *   [0] commandType (as float)
 *   [1] boundingBox.x
 *   [2] boundingBox.y
 *   [3] boundingBox.width
 *   [4] boundingBox.height
 *   [5] color.r  (or text color)
 *   [6] color.g
 *   [7] color.b
 *   [8] color.a
 *   [9] cornerRadius (topLeft, others assumed same)
 *   [10] extra1 (border width, font size, etc.)
 *   [11] extra2 (text length, font id, etc.)
 *   [12] extra3 (reserved / text pointer as u64 low bits)
 *   [13] extra4 (text pointer high bits)
 *
 * Total: 14 floats per command.
 */

#define CMD_STRIDE 14

/* Write all render commands into the provided float buffer.
 * Buffer must be at least cmdCount * CMD_STRIDE floats.
 * Returns number of commands written.
 */
int tge_clay_read_commands(float *out, int max_commands) {
    int count = last_commands.length < max_commands ? last_commands.length : max_commands;

    for (int i = 0; i < count; i++) {
        Clay_RenderCommand *cmd = Clay_RenderCommandArray_Get(&last_commands, i);
        float *o = out + i * CMD_STRIDE;

        o[0] = (float)cmd->commandType;
        o[1] = cmd->boundingBox.x;
        o[2] = cmd->boundingBox.y;
        o[3] = cmd->boundingBox.width;
        o[4] = cmd->boundingBox.height;

        /* Zero the rest by default */
        o[5] = o[6] = o[7] = o[8] = o[9] = o[10] = o[11] = o[12] = o[13] = 0;

        switch (cmd->commandType) {
            case CLAY_RENDER_COMMAND_TYPE_RECTANGLE:
                o[5] = cmd->renderData.rectangle.backgroundColor.r;
                o[6] = cmd->renderData.rectangle.backgroundColor.g;
                o[7] = cmd->renderData.rectangle.backgroundColor.b;
                o[8] = cmd->renderData.rectangle.backgroundColor.a;
                o[9] = cmd->renderData.rectangle.cornerRadius.topLeft;
                break;

            case CLAY_RENDER_COMMAND_TYPE_TEXT: {
                o[5] = cmd->renderData.text.textColor.r;
                o[6] = cmd->renderData.text.textColor.g;
                o[7] = cmd->renderData.text.textColor.b;
                o[8] = cmd->renderData.text.textColor.a;
                o[10] = (float)cmd->renderData.text.fontSize;
                o[11] = (float)cmd->renderData.text.stringContents.length;
                /* Pack text pointer into two floats (won't be used directly, TS reads text separately) */
                uintptr_t ptr = (uintptr_t)cmd->renderData.text.stringContents.chars;
                uint32_t lo = (uint32_t)(ptr & 0xFFFFFFFF);
                uint32_t hi = (uint32_t)((ptr >> 32) & 0xFFFFFFFF);
                memcpy(&o[12], &lo, 4);
                memcpy(&o[13], &hi, 4);
                break;
            }

            case CLAY_RENDER_COMMAND_TYPE_BORDER:
                o[5] = cmd->renderData.border.color.r;
                o[6] = cmd->renderData.border.color.g;
                o[7] = cmd->renderData.border.color.b;
                o[8] = cmd->renderData.border.color.a;
                o[9] = cmd->renderData.border.cornerRadius.topLeft;
                o[10] = (float)cmd->renderData.border.width.left;
                break;

            default:
                break;
        }
    }

    return count;
}

/* Read text content for a specific command by index.
 * Copies text into the provided buffer (null-terminated).
 * Returns the actual text length.
 */
int tge_clay_read_text(int cmd_index, char *out, int max_len) {
    if (cmd_index < 0 || cmd_index >= last_commands.length) return 0;

    Clay_RenderCommand *cmd = Clay_RenderCommandArray_Get(&last_commands, cmd_index);
    if (cmd->commandType != CLAY_RENDER_COMMAND_TYPE_TEXT) return 0;

    int len = cmd->renderData.text.stringContents.length;
    if (len > max_len - 1) len = max_len - 1;
    memcpy(out, cmd->renderData.text.stringContents.chars, len);
    out[len] = '\0';
    return len;
}

/* Set the pointer state for hover detection */
void tge_clay_set_pointer(float x, float y, int pressed) {
    Clay_SetPointerState((Clay_Vector2){x, y}, pressed != 0);
}

/* Update scroll containers.
 * enableDragScrolling=false — we only support mouse wheel, not drag. */
void tge_clay_update_scroll(float dx, float dy, float dt) {
    Clay_UpdateScrollContainers(false, (Clay_Vector2){dx, dy}, dt);
}
