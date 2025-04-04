import React, { ReactNode } from 'react';
import Head from 'next/head';
import { Box, Container, AppBar, Toolbar, Typography } from '@mui/material';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export default function Layout({ children, title = 'Meetini - AI Scheduling Assistant' }: LayoutProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Head>
        <title>{title}</title>
        <meta name="description" content="Meetini - Your AI scheduling assistant" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Meetini
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, py: 4 }}>
        {children}
      </Box>

      <Box component="footer" sx={{ py: 3, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            © {new Date().getFullYear()} Meetini. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
} 