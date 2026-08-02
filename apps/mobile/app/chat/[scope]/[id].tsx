import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, ErrorNote, Loading, Row, Small } from '../../../src/components/ui';
import { useMessages, useSendMessage, type ChatScope } from '../../../src/hooks/useSocial';
import { useSession } from '../../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../../src/theme';

export default function ChatScreen() {
  const { scope, id } = useLocalSearchParams<{ scope: ChatScope; id: string }>();
  const theme = useTheme();
  const { session } = useSession();
  const messages = useMessages(scope, id);
  const send = useSendMessage(scope, id);
  const [body, setBody] = useState('');

  if (messages.isLoading) return <Loading />;
  if (messages.error) return <ErrorNote error={messages.error} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {(messages.data ?? []).map((message) => {
            const mine = message.author_id === session?.user.id;
            return (
              <View
                key={message.id}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  backgroundColor: mine ? theme.accent : theme.card,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                {!mine ? <Small>{message.author?.display_name ?? 'Someone'}</Small> : null}
                <Body style={{ color: mine ? theme.accentText : theme.text }}>{message.body}</Body>
              </View>
            );
          })}
        </ScrollView>

        <Row gap={spacing.sm}>
          <View style={{ flex: 1, paddingLeft: spacing.lg }}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Say something"
              placeholderTextColor={theme.muted}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: radius.md,
                color: theme.text,
                padding: spacing.md,
                minHeight: 44,
              }}
            />
          </View>
          <View style={{ paddingRight: spacing.lg }}>
            <Button
              title="Send"
              disabled={body.trim().length === 0}
              onPress={() =>
                send.mutate(
                  { body: body.trim(), authorId: session!.user.id },
                  { onSuccess: () => setBody('') },
                )
              }
            />
          </View>
        </Row>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
