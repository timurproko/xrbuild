// Keep the starter scene and its 3D icon aligned with the generated icon colour in xrb-project.json.
import manifest from '../xrb-project.json';

const themes = {
  blue: { main: '#5bbcff', ring: '#3159b8', rim: '#668cff', icon: '#2f9bff' },
  green: { main: '#71c995', ring: '#23724a', rim: '#8de3ad', icon: '#269b5b' },
  amber: { main: '#e3aa3f', ring: '#9a6200', rim: '#f4ca70', icon: '#d58a20' },
  red: { main: '#ff8f85', ring: '#b0261d', rim: '#ffaaa2', icon: '#d94239' },
  purple: { main: '#b99bff', ring: '#7a45c9', rim: '#cfbbff', icon: '#864fd4' },
  teal: { main: '#5fd3c4', ring: '#12808a', rim: '#8ae7dc', icon: '#20a4af' },
  grey: { main: '#aeb8c8', ring: '#596270', rim: '#c6cfdd', icon: '#7d8796' },
};

export const iconTheme = themes[manifest.iconColor ?? 'blue'] ?? themes.blue;
