import './globals.css';

export const metadata = {
  title: 'Our Shared Library',
  description: 'Two hearts, one story',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-[#050505] text-slate-200">{children}</body>
    </html>
  );
}
