import { UpdateRequiredView } from '@/components/update-required-view';
import { useVersionGate } from '@/lib/app-version';

/** Preview of the blocking screen, reachable from the developer section in More. */
export default function UpdateRequiredPreview() {
  const gate = useVersionGate();
  return (
    <UpdateRequiredView
      current={gate.current}
      required={gate.config?.latestAppVersion ?? gate.current}
      url={gate.config?.downloadPageUrl ?? ''}
    />
  );
}
