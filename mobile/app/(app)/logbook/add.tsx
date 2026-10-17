// Log a flight by hand — the short form from the mockup (role preset, core
// fields, "More fields" for the rest). Return trip / Next leg / Duplicate
// arrive here with the flight already filled in.
import QuickFlightForm from '../../../src/components/logbook/QuickFlightForm';

export default function AddFlight() {
  return <QuickFlightForm title="Log a flight" />;
}
