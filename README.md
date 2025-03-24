# Meetini Smart Scheduling

This is an experimental branch for implementing advanced AI-powered scheduling features for Meetini.

## Key Features

1. Multi-Calendar Analysis
   - Simultaneously analyzes all participants' calendars
   - Finds common availability slots
   - Considers time zones and buffer preferences

2. Smart Learning System
   - Learns from user preferences and patterns
   - Tracks successful/unsuccessful meeting times
   - Adapts suggestions based on historical data

3. OpenAI Integration
   - Uses GPT-4 for intelligent scheduling decisions
   - Analyzes meeting patterns and relationships
   - Provides human-like scheduling logic

## Setup

1. Environment Variables Required:
   ```
   OPENAI_API_KEY=your_key_here
   GOOGLE_PROJECT_ID=your_project_id
   ```

2. Install Dependencies:
   ```bash
   npm install
   ```

3. Initialize Database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

## Architecture

The smart scheduling system consists of several components:

1. `SmartScheduler`: Core scheduling logic and AI integration
2. User Preferences System: Tracks and learns from user behavior
3. Calendar Integration: Handles multi-calendar analysis
4. Meeting History: Stores and analyzes past meetings

## Development Status

This is an experimental branch and should not be merged into production until thoroughly tested.
