import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Body, Button, Heading, Small } from './ui';
import { captureError } from '../lib/analytics';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A render error anywhere below this leaves a white screen and a force-quit as
 * the only way out — on a course, mid-round, with scores in the outbox. Those
 * scores are in MMKV and survive, but nobody knows that while staring at
 * nothing, and the natural response is to delete the app.
 *
 * So: say what happened, report it, and offer a way back that does not lose the
 * round. Resetting state re-renders the tree; it does not touch the outbox.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { componentStack: info.componentStack });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Heading>That screen broke</Heading>
        <Body>
          Something went wrong rendering this. Your scores are saved on this phone and will sync —
          nothing is lost.
        </Body>
        <Small>{error.message}</Small>
        <Button title="Try again" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
