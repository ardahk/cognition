import { moduleContext } from '@/platform/module';
import { PageHeader } from '@/platform/ui';
import manifest from './manifest';

export default async function Page() {
  await moduleContext(manifest);
  return <PageHeader title={manifest.name} description={manifest.description} />;
}
