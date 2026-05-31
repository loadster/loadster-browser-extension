import overpassLightUrl from '../../assets/fonts/Overpass-Light.woff2?url';
import overpassRegularUrl from '../../assets/fonts/Overpass-Regular.woff2?url';
import overpassSemiBoldUrl from '../../assets/fonts/Overpass-SemiBold.woff2?url';
import overpassExtraBoldUrl from '../../assets/fonts/Overpass-ExtraBold.woff2?url';

export const fontFaceCSS = `
@font-face { font-family: 'Overpass'; font-weight: 300; src: url('${overpassLightUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 400; src: url('${overpassRegularUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 600; src: url('${overpassSemiBoldUrl}') format('woff2'); }
@font-face { font-family: 'Overpass'; font-weight: 800; src: url('${overpassExtraBoldUrl}') format('woff2'); }
`;
