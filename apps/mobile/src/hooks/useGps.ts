import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/analytics';
import { fixIsUsable, type Point } from '../lib/geo';

export interface HolePoint {
  holeNumber: number;
  green: Point;
  front: Point | null;
  back: Point | null;
  source: 'osm' | 'manual' | 'provider';
}

export function useHolePoints(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course', courseId ?? 'none', 'points'],
    enabled: Boolean(courseId),
    // Course geometry does not move. Cache it hard — this is read on every hole.
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async (): Promise<HolePoint[]> => {
      const { data, error } = await supabase
        .from('hole_points')
        .select(
          'hole_number, green_lat, green_lng, green_front_lat, green_front_lng, green_back_lat, green_back_lng, source',
        )
        .eq('course_id', courseId!)
        .order('hole_number');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        holeNumber: row.hole_number,
        green: { lat: Number(row.green_lat), lng: Number(row.green_lng) },
        front:
          row.green_front_lat !== null && row.green_front_lng !== null
            ? { lat: Number(row.green_front_lat), lng: Number(row.green_front_lng) }
            : null,
        back:
          row.green_back_lat !== null && row.green_back_lng !== null
            ? { lat: Number(row.green_back_lat), lng: Number(row.green_back_lng) }
            : null,
        source: row.source as HolePoint['source'],
      }));
    },
  });
}

/** Pulls the course from OpenStreetMap. Server-side cached; safe to call often. */
export function useImportCourseGps(courseId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('course-gps', {
        body: { course_id: courseId },
      });
      if (error) throw error;
      return data as {
        imported: number;
        holesFound?: number;
        ambiguous?: number[];
        cached?: boolean;
      };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['course', courseId, 'points'] }),
  });
}

/**
 * Stand on the green and tap. Required rather than optional — OSM coverage is
 * uneven, and a crew whose home course is unmapped otherwise has no path at all.
 */
export function useSetGreenPoint(courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ hole, point }: { hole: number; point: Point }) => {
      const { error } = await supabase.rpc('set_green_point', {
        p_course_id: courseId,
        p_hole: hole,
        p_lat: point.lat,
        p_lng: point.lng,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['course', courseId, 'points'] }),
  });
}

export type FixState = 'idle' | 'denied' | 'searching' | 'ready';

export interface Fix {
  state: FixState;
  point: Point | null;
  accuracy: number | null;
}

/**
 * A live position while the scorecard is open.
 *
 * Deliberately not started until asked. Four hours of continuous GPS is the
 * fastest way to flatten a phone, and a scoring app that kills the battery on
 * the twelfth gets deleted — so this is opt-in per round rather than always on.
 *
 * A fix too vague to club off reports `searching` rather than a confident wrong
 * number; see fixIsUsable.
 */
export function usePosition(enabled: boolean): Fix {
  const [fix, setFix] = useState<Fix>({ state: 'idle', point: null, accuracy: null });

  useEffect(() => {
    if (!enabled) {
      setFix({ state: 'idle', point: null, accuracy: null });
      return;
    }

    let subscription: Location.LocationSubscription | null = null;
    let active = true;

    const start = async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (!granted) {
          setFix({ state: 'denied', point: null, accuracy: null });
          return;
        }
        setFix({ state: 'searching', point: null, accuracy: null });

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            // A golfer moves slowly and a yardage does not need 1Hz. Five
            // metres or three seconds is plenty and much kinder to the battery.
            distanceInterval: 5,
            timeInterval: 3000,
          },
          (reading) => {
            if (!active) return;
            const usable = fixIsUsable(reading.coords.accuracy);
            setFix({
              state: usable ? 'ready' : 'searching',
              point: usable
                ? { lat: reading.coords.latitude, lng: reading.coords.longitude }
                : null,
              accuracy: reading.coords.accuracy ?? null,
            });
          },
        );
      } catch (error) {
        captureError(error, { kind: 'location-watch' });
        if (active) setFix({ state: 'denied', point: null, accuracy: null });
      }
    };

    void start();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled]);

  return fix;
}
