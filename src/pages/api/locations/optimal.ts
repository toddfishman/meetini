import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { Client } from '@googlemaps/google-maps-services-js';
import { prisma } from '../../../lib/prisma';
import type { Prisma } from '@prisma/client';

const googleMaps = new Client({});

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface LocationSuggestion {
  name: string;
  address: string;
  rating?: number;
  priceLevel?: number;
  distance: number;
  coordinates: Coordinates;
  score: number;
  matchedPreferences: string[];
}

type UserWithLocation = Prisma.UserGetPayload<{
  include: { location: true; locationPreferences: true }
}>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { participantEmails, locationType, maxDistance = 5000 } = req.body;

    // Get participant locations and preferences from database
    const participants = await prisma.user.findMany({
      where: {
        email: { in: participantEmails },
        location: { isNot: null }
      },
      include: {
        location: true,
        locationPreferences: true
      }
    });

    if (participants.length === 0) {
      throw new Error('No participant locations found');
    }

    // Calculate the center point
    const center = findCenterPoint(
      participants.map(p => ({
        latitude: p.location!.latitude,
        longitude: p.location!.longitude
      }))
    );

    // Aggregate preferences
    const preferences = aggregatePreferences(participants);

    // Search for places with expanded criteria
    const response = await googleMaps.placesNearby({
      params: {
        location: { lat: center.latitude, lng: center.longitude },
        radius: maxDistance,
        type: getGooglePlaceType(locationType),
        key: process.env.GOOGLE_MAPS_API_KEY!,
        minprice: preferences.minPrice,
        maxprice: preferences.maxPrice,
        keyword: getKeywords(locationType, preferences).join(' ')
      }
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Places API error: ${response.data.status}`);
    }

    // Get detailed information for each place
    const detailedPlaces = await Promise.all(
      response.data.results.map(async place => {
        if (!place.place_id) return null;

        const details = await googleMaps.placeDetails({
          params: {
            place_id: place.place_id,
            fields: ['wheelchair_accessible_entrance', 'parking', 'opening_hours', 'price_level', 'rating', 'reviews', 'user_ratings_total'],
            key: process.env.GOOGLE_MAPS_API_KEY!
          }
        });

        return {
          basic: place,
          details: details.data.result
        };
      })
    );

    // Score and rank locations
    const scoredLocations = detailedPlaces
      .filter((place): place is NonNullable<typeof place> => 
        place !== null && place.basic.geometry?.location !== undefined
      )
      .map(place => {
        const matchedPreferences: string[] = [];
        let score = 0;

        // Base score from rating (0-5 points)
        if (place.basic.rating) {
          score += place.basic.rating;
          if (place.basic.rating >= preferences.minRating) {
            matchedPreferences.push('Minimum rating met');
          }
        }

        // Distance score (0-3 points, inversely proportional to distance)
        const distance = calculateDistance(center, {
          latitude: place.basic.geometry!.location.lat,
          longitude: place.basic.geometry!.location.lng
        });
        const distanceScore = Math.max(0, 3 * (1 - distance / maxDistance));
        score += distanceScore;
        if (distance <= preferences.maxDistance) {
          matchedPreferences.push('Within preferred distance');
        }

        // Price level score (0-2 points)
        if (place.basic.price_level !== undefined) {
          if (preferences.priceRange.includes(place.basic.price_level)) {
            score += 2;
            matchedPreferences.push('Matches price preference');
          }
        }

        // Accessibility score (0-2 points)
        if (preferences.accessibility && place.details?.wheelchair_accessible_entrance) {
          score += 2;
          matchedPreferences.push('Wheelchair accessible');
        }

        // Parking score (0-2 points)
        if (preferences.parking && place.details?.parking) {
          score += 2;
          matchedPreferences.push('Parking available');
        }

        // Popular times bonus (0-1 point)
        if (place.basic.user_ratings_total && place.basic.user_ratings_total > 100) {
          score += 1;
          matchedPreferences.push('Popular location');
        }

        return {
          name: place.basic.name || '',
          address: place.basic.vicinity || '',
          rating: place.basic.rating,
          priceLevel: place.basic.price_level,
          distance,
          coordinates: {
            latitude: place.basic.geometry!.location.lat,
            longitude: place.basic.geometry!.location.lng
          },
          score,
          matchedPreferences
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return res.status(200).json(scoredLocations);
  } catch (error) {
    console.error('Failed to find optimal location:', error);
    return res.status(500).json({ 
      error: 'Failed to find meeting locations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function aggregatePreferences(participants: UserWithLocation[]): {
  minRating: number;
  maxDistance: number;
  priceRange: number[];
  cuisineTypes: string[];
  amenities: string[];
  accessibility: boolean;
  parking: boolean;
  minPrice?: number;
  maxPrice?: number;
} {
  const allPreferences = participants.flatMap(p => p.locationPreferences);

  return {
    minRating: Math.min(...allPreferences.map(p => p?.minRating || 4.0)),
    maxDistance: Math.min(...allPreferences.map(p => p?.maxDistance || 5000)),
    priceRange: Array.from(new Set(allPreferences.flatMap(p => p?.priceRange || [1, 2, 3]))),
    cuisineTypes: Array.from(new Set(allPreferences.flatMap(p => p?.cuisineTypes || []))),
    amenities: Array.from(new Set(allPreferences.flatMap(p => p?.amenities || []))),
    accessibility: allPreferences.some(p => p?.accessibility),
    parking: allPreferences.some(p => p?.parking),
    minPrice: Math.min(...allPreferences.map(p => Math.min(...(p?.priceRange || [1])))),
    maxPrice: Math.max(...allPreferences.map(p => Math.max(...(p?.priceRange || [3]))))
  };
}

function getKeywords(locationType: string, preferences: ReturnType<typeof aggregatePreferences>): string[] {
  const keywords = [];

  if (locationType.toLowerCase().includes('restaurant')) {
    keywords.push(...preferences.cuisineTypes);
  }

  keywords.push(...preferences.amenities);

  return keywords;
}

function findCenterPoint(locations: Coordinates[]): Coordinates {
  const total = locations.reduce((acc, loc) => ({
    latitude: acc.latitude + loc.latitude,
    longitude: acc.longitude + loc.longitude
  }), { latitude: 0, longitude: 0 });

  return {
    latitude: total.latitude / locations.length,
    longitude: total.longitude / locations.length
  };
}

function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = point1.latitude * Math.PI / 180;
  const φ2 = point2.latitude * Math.PI / 180;
  const Δφ = (point2.latitude - point1.latitude) * Math.PI / 180;
  const Δλ = (point2.longitude - point1.longitude) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

function getGooglePlaceType(locationType: string): string {
  const type = locationType.toLowerCase();
  
  if (type.includes('restaurant')) return 'restaurant';
  if (type.includes('cafe')) return 'cafe';
  if (type.includes('bar')) return 'bar';
  if (type.includes('park')) return 'park';
  if (type.includes('gym')) return 'gym';
  if (type.includes('library')) return 'library';
  
  return 'establishment';
}
