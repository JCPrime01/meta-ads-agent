import axios from 'axios';

const BASE = 'https://graph.facebook.com/v19.0';
const TOKEN = process.env.META_ACCESS_TOKEN!;

export const metaGet = (path: string, params: Record<string, string> = {}) =>
  axios.get(`${BASE}${path}`, { params: { ...params, access_token: TOKEN } }).then(r => r.data);

export const metaPost = (path: string, data: Record<string, unknown>) =>
  axios.post(`${BASE}${path}`, { ...data, access_token: TOKEN }).then(r => r.data);

export const AD_ACCOUNTS: string[] = (process.env.META_AD_ACCOUNTS || '').split(',').map(s => s.trim()).filter(Boolean);
