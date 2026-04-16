#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

typedef struct {
  int fd;
  char *name;
} tge_kitty_shm_handle;

static char tge_kitty_shm_last_error[512] = {0};

static void tge_kitty_shm_set_error(const char *message) {
  if (!message) {
    tge_kitty_shm_last_error[0] = '\0';
    return;
  }
  snprintf(tge_kitty_shm_last_error, sizeof(tge_kitty_shm_last_error), "%s", message);
}

static void tge_kitty_shm_set_errno(const char *context) {
  snprintf(
    tge_kitty_shm_last_error,
    sizeof(tge_kitty_shm_last_error),
    "%s: [%d] %s",
    context,
    errno,
    strerror(errno)
  );
}

uint32_t tge_kitty_shm_helper_version(void) {
  return 1;
}

uint32_t tge_kitty_shm_get_last_error_length(void) {
  return (uint32_t) strlen(tge_kitty_shm_last_error);
}

uint32_t tge_kitty_shm_copy_last_error(char *buffer, uint32_t capacity) {
  if (!buffer || capacity == 0) return 0;
  uint32_t len = tge_kitty_shm_get_last_error_length();
  uint32_t copy_len = len < (capacity - 1) ? len : (capacity - 1);
  if (copy_len > 0) memcpy(buffer, tge_kitty_shm_last_error, copy_len);
  buffer[copy_len] = '\0';
  return copy_len;
}

uint64_t tge_kitty_shm_prepare(const char *name, const uint8_t *data, uint64_t size, uint32_t mode) {
  if (!name || !data || size == 0) {
    tge_kitty_shm_set_error("invalid arguments");
    return 0;
  }

  shm_unlink(name);

  int fd = shm_open(name, O_CREAT | O_EXCL | O_RDWR, mode);
  if (fd < 0) {
    tge_kitty_shm_set_errno("shm_open failed");
    return 0;
  }

  if (ftruncate(fd, (off_t) size) != 0) {
    tge_kitty_shm_set_errno("ftruncate failed");
    close(fd);
    shm_unlink(name);
    return 0;
  }

  void *mapped = mmap(NULL, (size_t) size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (mapped == MAP_FAILED) {
    tge_kitty_shm_set_errno("mmap failed");
    close(fd);
    shm_unlink(name);
    return 0;
  }

  memcpy(mapped, data, (size_t) size);
  if (msync(mapped, (size_t) size, MS_SYNC) != 0) {
    tge_kitty_shm_set_errno("msync failed");
    munmap(mapped, (size_t) size);
    close(fd);
    shm_unlink(name);
    return 0;
  }

  if (munmap(mapped, (size_t) size) != 0) {
    tge_kitty_shm_set_errno("munmap failed");
    close(fd);
    shm_unlink(name);
    return 0;
  }

  tge_kitty_shm_handle *handle = (tge_kitty_shm_handle *) calloc(1, sizeof(tge_kitty_shm_handle));
  if (!handle) {
    tge_kitty_shm_set_error("calloc failed");
    close(fd);
    shm_unlink(name);
    return 0;
  }

  handle->fd = fd;
  handle->name = strdup(name);
  if (!handle->name) {
    tge_kitty_shm_set_error("strdup failed");
    close(fd);
    shm_unlink(name);
    free(handle);
    return 0;
  }

  tge_kitty_shm_set_error(NULL);
  return (uint64_t) (uintptr_t) handle;
}

uint32_t tge_kitty_shm_release(uint64_t handle_ptr, uint32_t unlink_name) {
  if (handle_ptr == 0) return 0;
  tge_kitty_shm_handle *handle = (tge_kitty_shm_handle *) (uintptr_t) handle_ptr;
  int result = 0;

  if (handle->fd >= 0 && close(handle->fd) != 0) {
    tge_kitty_shm_set_errno("close failed");
    result = 1;
  }

  if (unlink_name && handle->name && shm_unlink(handle->name) != 0 && errno != ENOENT) {
    tge_kitty_shm_set_errno("shm_unlink failed");
    result = 1;
  }

  if (handle->name) free(handle->name);
  free(handle);
  return (uint32_t) result;
}
