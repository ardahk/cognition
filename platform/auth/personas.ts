export const PERSONAS = {
  alex: {
    id: 'alex',
    email: 'alex@fernpay.test',
    name: 'Alex Rivera',
    title: 'Support Agent',
    groups: ['okta:support'],
  },
  priya: {
    id: 'priya',
    email: 'priya@fernpay.test',
    name: 'Priya Shah',
    title: 'Support Operations Lead',
    groups: ['okta:ops-leads'],
  },
  sam: {
    id: 'sam',
    email: 'sam@fernpay.test',
    name: 'Sam Lee',
    title: 'KYC Analyst',
    groups: ['okta:kyc-analysts'],
  },
  morgan: {
    id: 'morgan',
    email: 'morgan@fernpay.test',
    name: 'Morgan Diaz',
    title: 'Compliance Officer',
    groups: ['okta:compliance'],
  },
  jordan: {
    id: 'jordan',
    email: 'jordan@fernpay.test',
    name: 'Jordan Park',
    title: 'Software Engineer (on-call)',
    groups: ['okta:engineering', 'okta:oncall'],
  },
  taylor: {
    id: 'taylor',
    email: 'taylor@fernpay.test',
    name: 'Taylor Wong',
    title: 'Engineering Lead',
    groups: ['okta:engineering', 'okta:eng-leads', 'okta:platform-admins'],
  },
} as const;

export type PersonaId = keyof typeof PERSONAS;
