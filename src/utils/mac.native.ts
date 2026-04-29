import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

async function readNetworkFile(path: string): Promise<string | null> {
  try {
    const content = await FileSystem.readAsStringAsync('file://' + path);
    const mac = content.trim();
    if (mac && mac !== '00:00:00:00:00:00' && mac !== '02:00:00:00:00:00') {
      return mac.toUpperCase();
    }
    return null;
  } catch {
    return null;
  }
}

// Reads the hardware MAC address from Linux network interface sysfs.
// Fire TV Cube uses eth0 (Ethernet), Fire TV Stick uses wlan0 (WiFi).
export async function getMacAddress(): Promise<string> {
  if (Platform.OS !== 'android') return '';
  const interfaces = ['eth0', 'wlan0', 'wlan1', 'eth1'];
  for (const iface of interfaces) {
    const mac = await readNetworkFile(`/sys/class/net/${iface}/address`);
    if (mac) return mac;
  }
  return '';
}
