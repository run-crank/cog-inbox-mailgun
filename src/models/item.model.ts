import { Storage } from './storage.model';

export interface Item {
  tags?: any[];
  timestamp?: number;
  storage?: Storage;
}
