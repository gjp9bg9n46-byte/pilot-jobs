declare module 'suncalc' {
  export function getPosition(date: Date, lat: number, lng: number): { altitude: number; azimuth: number };
  const SunCalc: { getPosition: typeof getPosition };
  export default SunCalc;
}
