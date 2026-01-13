import FloatingBoxes from './components/FloatingBoxes';

function App() {
  return (
    <>
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        color: '#fff',
        fontSize: '14px',
        opacity: 0.8,
        textShadow: '0 2px 10px rgba(0,150,255,0.5)',
        zIndex: 100,
        fontFamily: "'Segoe UI', Arial, sans-serif"
      }}>
        ✨ Floating Boxes React – Gerakkan mouse untuk mendorong kotak
      </div>
      <FloatingBoxes />
    </>
  );
}

export default App;
