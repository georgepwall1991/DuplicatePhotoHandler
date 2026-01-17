import { invoke as tauriInvoke, convertFileSrc as tauriConvertFileSrc } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';

// Tauri v2 uses __TAURI_INTERNALS__ instead of v1's __TAURI_IPC__
export const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

export async function invoke<T>(command: string, args?: any): Promise<T> {
  if (isTauri()) {
    return tauriInvoke(command, args);
  }

  console.log(`[Mock] Invoking command: ${command}`, args);

  // Mock responses for browser testing
  if (command === 'start_scan') {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
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
        } as T);
      }, 2000);
    });
  }

  if (command === 'cancel_scan') {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true as T);
      }, 100);
    });
  }

  if (command === 'trash_files') {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve((args?.paths?.length || 0) as T);
      }, 1000);
    });
  }

  throw new Error(`Mock command not implemented: ${command}`);
}

export async function listen(event: string, handler: (event: any) => void): Promise<() => void> {
  if (isTauri()) {
    return tauriListen(event, handler);
  }

  console.log(`[Mock] Listening for event: ${event}`);

  // Simulate events for browser testing
  if (event === 'scan-event') {
    setTimeout(() => {
      handler({ payload: { Scan: { Progress: { photos_found: 100 } } } });
      setTimeout(() => {
        handler({ payload: { Hash: { Progress: { completed: 50, total: 100 } } } });
        setTimeout(() => {
          handler({ payload: { Compare: { Progress: true } } });
        }, 500);
      }, 500);
    }, 500);
  }

  return () => console.log(`[Mock] Unlistening from event: ${event}`);
}

export async function open(options: any): Promise<string | string[] | null> {
  if (isTauri()) {
    return tauriOpen(options);
  }

  console.log('[Mock] Opening file dialog', options);
  return ['/Users/mock/Pictures/Travel', '/Users/mock/Documents/Work'];
}

export function convertFileSrc(path: string): string {
  if (isTauri()) {
    return tauriConvertFileSrc(path);
  }

  // In browser, return a placeholder or the path itself (since we use mock paths)
  return `https://picsum.photos/seed/${path.split('/').pop()}/800/600`;
}
