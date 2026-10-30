import AppBar from '@mui/material/AppBar';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

/** Esqueleto del portal (T6.1); las rutas y la sesión llegan en T6.2. */
export function App() {
  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" component="h1">
            Transporte de carga
          </Typography>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 4 }}>
        <Typography>Portal del cliente</Typography>
      </Container>
    </>
  );
}
