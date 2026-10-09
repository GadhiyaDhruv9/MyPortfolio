import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppData } from '../domain/types';
import { normalizeData, seedData } from './seed';

export { buildTransaction, DATA_VERSION, emptyData, normalizeData, seedData, uid } from './seed';

const STORAGE_KEY = 'portfolio-tracker/data/v1';

export async function loadData(): Promise<AppData> {
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  if (json == null) {
    const seeded = seedData();
    await saveData(seeded);
    return seeded;
  }
  return normalizeData(JSON.parse(json));
}

export async function saveData(data: AppData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
