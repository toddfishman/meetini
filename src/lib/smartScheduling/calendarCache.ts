import { calendar_v3 } from 'googleapis';

interface CachedCalendarData {
  events: calendar_v3.Schema$Event[];
  timeMin: string;
  timeMax: string;
  lastFetched: number;
}

interface CalendarWindow {
  start: Date;
  end: Date;
  events: calendar_v3.Schema$Event[];
}

export class CalendarCache {
  private static instance: CalendarCache;
  private cache: Map<string, CachedCalendarData>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly WINDOW_SIZE = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly PREFETCH_THRESHOLD = 0.8; // Prefetch when 80% through window

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): CalendarCache {
    if (!CalendarCache.instance) {
      CalendarCache.instance = new CalendarCache();
    }
    return CalendarCache.instance;
  }

  private isExpired(data: CachedCalendarData): boolean {
    return Date.now() - data.lastFetched > this.CACHE_TTL;
  }

  private getWindows(timeMin: Date, timeMax: Date): { start: Date; end: Date }[] {
    const windows: { start: Date; end: Date }[] = [];
    let currentStart = new Date(timeMin);

    while (currentStart < timeMax) {
      const windowEnd = new Date(Math.min(
        currentStart.getTime() + this.WINDOW_SIZE,
        timeMax.getTime()
      ));
      windows.push({ start: currentStart, end: windowEnd });
      currentStart = windowEnd;
    }

    return windows;
  }

  public async getEvents(
    email: string,
    timeMin: Date,
    timeMax: Date,
    calendar: calendar_v3.Calendar
  ): Promise<calendar_v3.Schema$Event[]> {
    const windows = this.getWindows(timeMin, timeMax);
    const allEvents: calendar_v3.Schema$Event[] = [];

    for (const window of windows) {
      const cachedData = this.cache.get(this.getCacheKey(email, window.start, window.end));
      
      if (cachedData && !this.isExpired(cachedData)) {
        allEvents.push(...cachedData.events);
        
        // Check if we need to prefetch the next window
        const windowProgress = (Date.now() - window.start.getTime()) / this.WINDOW_SIZE;
        if (windowProgress > this.PREFETCH_THRESHOLD) {
          const nextWindow = {
            start: window.end,
            end: new Date(window.end.getTime() + this.WINDOW_SIZE)
          };
          this.prefetchWindow(email, nextWindow.start, nextWindow.end, calendar);
        }
      } else {
        const events = await this.fetchAndCacheWindow(email, window.start, window.end, calendar);
        allEvents.push(...events);
      }
    }

    return allEvents;
  }

  private getCacheKey(email: string, timeMin: Date, timeMax: Date): string {
    return `${email}:${timeMin.toISOString()}:${timeMax.toISOString()}`;
  }

  private async fetchAndCacheWindow(
    email: string,
    timeMin: Date,
    timeMax: Date,
    calendar: calendar_v3.Calendar
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const response = await calendar.events.list({
        calendarId: email,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500
      });

      const events = response.data.items || [];
      
      this.cache.set(this.getCacheKey(email, timeMin, timeMax), {
        events,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        lastFetched: Date.now()
      });

      return events;
    } catch (error) {
      console.error(`Error fetching calendar for ${email}:`, error);
      return [];
    }
  }

  private async prefetchWindow(
    email: string,
    timeMin: Date,
    timeMax: Date,
    calendar: calendar_v3.Calendar
  ): Promise<void> {
    const cacheKey = this.getCacheKey(email, timeMin, timeMax);
    if (!this.cache.has(cacheKey)) {
      // Fetch in background
      this.fetchAndCacheWindow(email, timeMin, timeMax, calendar)
        .catch(error => console.error('Error prefetching calendar window:', error));
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public removeCachedData(email: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(email)) {
        this.cache.delete(key);
      }
    }
  }
}
