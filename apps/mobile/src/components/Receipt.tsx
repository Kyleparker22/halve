import { useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Body, Button, Row, Small } from './ui';
import { useAttachReceipt, useReceiptUrl } from '../hooks/useTrips';
import { spacing, useTheme } from '../theme';

interface Props {
  tripId: string;
  expenseId: string;
  receiptPath: string | null;
}

/**
 * Attach or view the receipt on one expense.
 *
 * The thumbnail is a signed URL that expires, so it is fetched when the row
 * renders rather than stored — the whole point of a private bucket is that
 * there is no durable link to leak.
 */
export function Receipt({ tripId, expenseId, receiptPath }: Props) {
  const theme = useTheme();
  const attach = useAttachReceipt(tripId);
  const signed = useReceiptUrl(receiptPath);
  const [open, setOpen] = useState(false);

  const pick = async () => {
    // Photo library only, and only the one image the user picks — iOS grants
    // limited access for this and never needs the whole library.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    attach.mutate({ expenseId, uri: result.assets[0].uri });
  };

  if (!receiptPath) {
    return (
      <Row justify="space-between">
        <Small>No receipt</Small>
        <Button
          title={attach.isPending ? 'Uploading…' : 'Add one'}
          variant="secondary"
          disabled={attach.isPending}
          onPress={() => void pick()}
        />
      </Row>
    );
  }

  return (
    <>
      <Row justify="space-between">
        <Small>Receipt attached</Small>
        <Pressable onPress={() => setOpen(true)}>
          {signed.data ? (
            <Image
              source={{ uri: signed.data }}
              style={{ width: 44, height: 44, borderRadius: 6 }}
              accessibilityLabel="Receipt thumbnail"
            />
          ) : (
            <Small>loading…</Small>
          )}
        </Pressable>
      </Row>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.9)',
            justifyContent: 'center',
            padding: spacing.md,
          }}
        >
          {signed.data ? (
            <Image
              source={{ uri: signed.data }}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
              accessibilityLabel="Receipt"
            />
          ) : (
            <View>
              <Body style={{ color: theme.text }}>Could not load that receipt.</Body>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}
