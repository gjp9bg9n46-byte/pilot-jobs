// Web target of the A4 preview. react-native-webview has no web build, so the
// same HTML goes into a sandboxed iframe — identical pixels, no native module.
export default function SheetView({ html }: { html: string }) {
  return (
    // eslint-disable-next-line react/no-unknown-property
    <iframe
      title="CV preview"
      srcDoc={html}
      scrolling="no"
      style={{ flex: 1, width: '100%', height: '100%', border: 0, background: '#fff' }}
    />
  );
}
