import { invoke as tauriInvoke, convertFileSrc as tauriConvertFileSrc } from '@tauri-apps/api/core';
import { listen as tauriListen, type Event } from '@tauri-apps/api/event';
import { open as tauriOpen, type OpenDialogOptions } from '@tauri-apps/plugin-dialog';

// Type for Tauri internals check
interface WindowWithTauri extends Window {
  __TAURI_INTERNALS__?: unknown;
}

// Tauri v2 uses __TAURI_INTERNALS__ instead of v1's __TAURI_IPC__
export const isTauri = () => !!(window as WindowWithTauri).__TAURI_INTERNALS__;

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    return tauriInvoke(command, args);
  }

  console.log(`[Mock] Invoking command: ${command}`, args);

  // Helper for delays
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Mock responses for browser testing
  if (command === 'start_scan' || command === 'scan_screenshots' || command === 'scan_large_files' || command === 'scan_unorganized' || command === 'scan_similar') {
    await wait(1500);

    if (command === 'scan_similar') {
      return {
        groups: [
          {
            id: 'sim-1',
            photos: [
              { path: '/mock/similar/a1.jpg', score: 0.95, size_bytes: 1024 * 800 },
              { path: '/mock/similar/a2.jpg', score: 0.94, size_bytes: 1024 * 810 }
            ],
            common_metadata: { camera: 'iPhone 15', date: '2024-01-10' }
          }
        ],
        total_photos: 10,
        scan_duration_ms: 500
      } as T;
    }

    if (command === 'scan_large_files') {
      return {
        files: [
          { path: '/mock/large/video.mov', size_bytes: 1024 * 1024 * 850, filename: 'video.mov', modified: '2024-01-01' },
          { path: '/mock/large/raw.arw', size_bytes: 1024 * 1024 * 45, filename: 'raw.arw', modified: '2024-01-02' }
        ],
        total_size_bytes: 1024 * 1024 * 895,
        scan_duration_ms: 300
      } as T;
    }

    if (command === 'scan_screenshots') {
      return {
        all_screenshots: [
          { path: '/mock/ss/1.png', size_bytes: 1024 * 500, width: 1170, height: 2532, confidence: 'high', detection_reason: 'Metadata match' }
        ],
        duplicate_groups: [],
        total_size_bytes: 1024 * 500,
        scan_duration_ms: 400
      } as T;
    }

    if (command === 'scan_unorganized') {
      return {
        files: [
          { path: '/mock/unorg/img.jpg', filename: 'img.jpg', size_bytes: 1024 * 300, reason: 'RootDirectory' }
        ],
        total_files: 1,
        scan_duration_ms: 200
      } as T;
    }

    return {
      total_photos: 1250,
      duplicate_groups: 42,
      duplicate_count: 85,
      potential_savings_bytes: 1024 * 1024 * 450, // 450 MB
      duration_ms: 1250,
      groups: [
        {
          id: '1',
          photos: ['/mock/path/photo1.jpg', '/mock/path/photo1_copy.jpg'],
          representative: '/mock/path/photo1.jpg',
          match_type: 'Exact',
          duplicate_count: 1,
          duplicate_size_bytes: 1024 * 1024 * 4.2
        },
        {
          id: '2',
          photos: ['/mock/path/img01.png', '/mock/path/img01_ref.png', '/mock/path/img01_final.png'],
          representative: '/mock/path/img01.png',
          match_type: 'NearExact (99%)',
          duplicate_count: 2,
          duplicate_size_bytes: 1024 * 1024 * 8.5
        },
        {
          id: '3',
          photos: ['/mock/path/sunset.jpg', '/mock/path/sunset_edit.jpg'],
          representative: '/mock/path/sunset.jpg',
          match_type: 'Similar (85%)',
          duplicate_count: 1,
          duplicate_size_bytes: 1024 * 1024 * 3.1
        }
      ],
      errors: []
    } as T;
  }

  if (command === 'get_scan_history') {
    return {
      entries: [
        {
          id: 'hist-1',
          module_type: 'Duplicates',
          scan_time: Date.now() / 1000 - 3600,
          paths: ['/Users/mock/Pictures'],
          total_files: 1500,
          groups_found: 12,
          duplicates_found: 24,
          potential_savings: 1024 * 1024 * 150,
          duration_ms: 2500,
          status: 'Completed'
        }
      ],
      total_count: 1
    } as T;
  }

  if (command === 'get_cache_info') {
    return {
      entries: 15420,
      size_bytes: 1024 * 1024 * 12,
      path: '/Users/mock/Library/Application Support/com.photodedup.app/cache.db'
    } as T;
  }

  if (command === 'clear_cache' || command === 'cancel_scan' || command === 'delete_scan_history' || command === 'clear_scan_history') {
    await wait(500);
    return (command === 'clear_scan_history' ? 1 : true) as T;
  }

  if (command === 'get_file_info') {
    return {
      path: args?.path || '/mock/path/img.jpg',
      filename: (args?.path as string)?.split('/').pop() || 'img.jpg',
      size_bytes: 1024 * 1024 * 2.5,
      modified: '2024-01-15 14:30',
      dimensions: [4000, 3000]
    } as T;
  }

  if (command === 'trash_files') {
    await wait(1000);
    const paths = args?.paths as string[] | undefined;
    return { trashed: paths?.length || 0, errors: [] } as T;
  }

  throw new Error(`Mock command not implemented: ${command}`);
}

export async function listen<T>(event: string, handler: (event: Event<T>) => void): Promise<() => void> {
  if (isTauri()) {
    return tauriListen(event, handler);
  }

  console.log(`[Mock] Listening for event: ${event}`);

  // Simulate events for browser testing
  if (event === 'scan-event' || event === 'screenshot-scan-event' || event === 'large-file-scan-event' || event === 'unorganized-scan-event' || event === 'similar-scan-event') {
    const mockEvent = (payload: T) => ({ event, id: 0, payload } as Event<T>);
    setTimeout(() => {
      handler(mockEvent({ Scan: { Progress: { photos_found: 100 } } } as T));
      setTimeout(() => {
        handler(mockEvent({ Hash: { Progress: { completed: 50, total: 100 } } } as T));
        setTimeout(() => {
          handler(mockEvent({ Compare: { Progress: true } } as T));
        }, 500);
      }, 500);
    }, 500);
  }

  return () => console.log(`[Mock] Unlistening from event: ${event}`);
}

export async function open(options: OpenDialogOptions): Promise<string | string[] | null> {
  if (isTauri()) {
    return tauriOpen(options);
  }

  console.log('[Mock] Opening file dialog', options);
  return ['/Users/mock/Pictures/Travel', '/Users/mock/Documents/Work'];
}

export const save = open;

export function convertFileSrc(path: string): string {
  if (isTauri()) {
    return tauriConvertFileSrc(path);
  }

  // In browser, return a placeholder or the path itself (since we use mock paths)
  return `https://picsum.photos/seed/${path.split('/').pop()}/800/600`;
}
