import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Heading, Row, Screen, Small, Title } from '../../src/components/ui';
import { HoleCardEditor, blankCard, cardIsValid } from '../../src/components/HoleCardEditor';
import { useCreateManualCourse, type HoleDraft } from '../../src/hooks/useRounds';
import { radius, spacing, useTheme } from '../../src/theme';

/**
 * Adding a course by hand. Municipal courses are frequently missing from any
 * provider, or missing the stroke indexes that net games need — the build plan
 * calls this out as a likely source of slippage, so it is a first-class path
 * rather than a workaround.
 */
export default function NewCourseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const create = useCreateManualCourse();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [teeName, setTeeName] = useState('White');
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState('');
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [holes, setHoles] = useState<HoleDraft[]>(blankCard(18));

  const setCount = (count: 9 | 18) => {
    setHoleCount(count);
    setHoles(blankCard(count));
  };

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    padding: spacing.md,
    minHeight: 48,
    fontSize: 17,
  };

  const ready = name.trim().length > 0 && cardIsValid(holes);

  return (
    <Screen>
      <Title>Add a course</Title>
      <Small>
        For the muni no provider has. Rating and slope are optional — without them a net game falls
        back to your index, which is close enough to play off.
      </Small>

      <Card>
        <Heading>Course</Heading>
        <TextInput
          style={input}
          testID="course-name"
          value={name}
          onChangeText={setName}
          placeholder="Rackham Golf Club"
          placeholderTextColor={theme.muted}
        />
        <Row gap={spacing.sm}>
          <TextInput
            style={[input, { flex: 2 }]}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor={theme.muted}
          />
          <TextInput
            style={[input, { flex: 1 }]}
            value={state}
            onChangeText={setState}
            placeholder="MI"
            placeholderTextColor={theme.muted}
            autoCapitalize="characters"
          />
        </Row>
      </Card>

      <Card>
        <Heading>Tee</Heading>
        <TextInput
          style={input}
          value={teeName}
          onChangeText={setTeeName}
          placeholder="White"
          placeholderTextColor={theme.muted}
        />
        <Row gap={spacing.sm}>
          <TextInput
            style={[input, { flex: 1 }]}
            value={rating}
            onChangeText={setRating}
            placeholder="Rating 71.2"
            placeholderTextColor={theme.muted}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <TextInput
            style={[input, { flex: 1 }]}
            value={slope}
            onChangeText={setSlope}
            placeholder="Slope 124"
            placeholderTextColor={theme.muted}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </Row>
        <Row gap={spacing.md}>
          <Pressable onPress={() => setCount(18)}>
            <Body style={{ color: holeCount === 18 ? theme.accent : theme.text }}>18 holes</Body>
          </Pressable>
          <Pressable onPress={() => setCount(9)}>
            <Body style={{ color: holeCount === 9 ? theme.accent : theme.text }}>9 holes</Body>
          </Pressable>
        </Row>
      </Card>

      <HoleCardEditor holes={holes} onChange={setHoles} />

      <Button
        title="Save course"
        disabled={!ready}
        loading={create.isPending}
        onPress={() =>
          create.mutate(
            {
              name: name.trim(),
              city: city.trim(),
              state: state.trim(),
              teeName: teeName.trim(),
              rating: rating.trim() === '' ? null : Number(rating),
              slope: slope.trim() === '' ? null : Number(slope),
              holes,
            },
            { onSuccess: () => router.back() },
          )
        }
      />
      {create.error ? <Small>{(create.error as Error).message}</Small> : null}
    </Screen>
  );
}
