import { registerAs } from '@nestjs/config';

export default registerAs('openrouter', () => ({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek/deepseek-v4.1-flash-1017',
}));
