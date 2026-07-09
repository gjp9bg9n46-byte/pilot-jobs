import { useLocalSearchParams } from 'expo-router';
import EmployerJobForm from '../../../../../src/components/employer/EmployerJobForm';

export default function EditJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EmployerJobForm jobId={id} />;
}
