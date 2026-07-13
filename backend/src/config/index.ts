import dotenv from 'dotenv';
import loadConfiguration from './configuration';

dotenv.config();

export const config = loadConfiguration();

export type AppConfig = ReturnType<typeof loadConfiguration>;
