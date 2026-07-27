import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { captureException } from '../infrastructure/observability';

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, { source: 'render', componentStack: info.componentStack ?? '' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>Restart this screen and try again.</Text>
        <Pressable onPress={() => this.setState({ error: null })} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#161616' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#B82F29' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
