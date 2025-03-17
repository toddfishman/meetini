import Redis from 'ioredis';

// Initialize Redis client with retry strategy
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// Handle Redis connection events
redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

// Wrap Redis operations with error handling
export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number = 300): Promise<void> {
  try {
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch (error) {
    console.error('Redis set error:', error);
  }
}

export { redis };
