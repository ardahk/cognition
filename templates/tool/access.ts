import { defineAccess } from '@/platform/define';
import manifest from './manifest';

export default defineAccess(manifest, { engineer: ['__TOOL_ID__.view'] });
