// Native A4 preview: a non-scrolling WebView showing the very HTML that
// expo-print turns into the PDF. See SheetView.web.tsx for the web target.
import { WebView } from 'react-native-webview';
import { StyleSheet } from 'react-native';

export default function SheetView({ html }: { html: string }) {
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={styles.web}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: '#fff' } });
