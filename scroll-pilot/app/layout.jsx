import './globals.css';

export const metadata = { title: 'Healthier · scroll pilot', description: 'Hero head → iso letter paths → aerial dots → filled type' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* d1's display face (KMR Melange Grotesk), loaded by relative path so the static export works anywhere */}
        <style>{`
@font-face{font-family:"KMR Melange Grotesk";src:url(fonts/KMRMelangeGrotesk-Regular.otf) format("opentype");font-weight:300 449;font-display:swap}
@font-face{font-family:"KMR Melange Grotesk";src:url(fonts/KMRMelangeGrotesk-Medium.otf) format("opentype");font-weight:450 900;font-display:swap}`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
