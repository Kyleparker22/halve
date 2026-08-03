import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, ErrorNote, Loading, Screen, Small, Title } from '../../../src/components/ui';
import { HoleCardEditor, cardIsValid } from '../../../src/components/HoleCardEditor';
import { useTeeCard, useUpdateHoleCard, type HoleDraft } from '../../../src/hooks/useRounds';

/**
 * Correcting a scorecard. `id` is a tee id — pars and stroke indexes belong to
 * a tee, not a course.
 *
 * This is the needs_review path from the data model: providers routinely omit
 * stroke indexes on municipal courses, and net games are unplayable without
 * them, so someone with the card in hand fixes it once for the whole crew.
 */
export default function FixCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const card = useTeeCard(id);
  const update = useUpdateHoleCard();
  const [holes, setHoles] = useState<HoleDraft[]>([]);

  useEffect(() => {
    if (!card.data) return;
    setHoles(
      card.data.holes.map((hole) => ({
        number: hole.number,
        par: hole.par,
        stroke_index: hole.stroke_index,
        yardage: hole.yardage,
      })),
    );
  }, [card.data]);

  if (card.isLoading) return <Loading />;
  if (card.error) return <ErrorNote error={card.error} />;
  if (!card.data || holes.length === 0) return <Loading />;

  return (
    <Screen>
      <Title>{card.data.tee.courses.name}</Title>
      <Small>
        {card.data.tee.name} tees
        {card.data.tee.courses.needs_review
          ? ' — the provider did not supply stroke indexes for this course, so they were guessed from yardage. Fix them against the real card before playing a net game.'
          : ''}
      </Small>

      <HoleCardEditor holes={holes} onChange={setHoles} />

      <Button
        title="Save the card"
        disabled={!cardIsValid(holes)}
        loading={update.isPending}
        onPress={() =>
          update.mutate({ teeId: id, holes }, { onSuccess: () => router.back() })
        }
      />
      {update.error ? <Small>{(update.error as Error).message}</Small> : null}
    </Screen>
  );
}
