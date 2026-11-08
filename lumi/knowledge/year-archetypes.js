export const LUMI_YEAR_ARCHETYPES = Object.freeze({
  1:Object.freeze({ id:'1', name:'INITIATOR', themes:Object.freeze(['independence','confidence','ambition','beginning','leadership']) }),
  2:Object.freeze({ id:'2', name:'HARMONIZER', themes:Object.freeze(['relationships','cooperation','calm','sensitivity','balance']) }),
  3:Object.freeze({ id:'3', name:'CREATOR', themes:Object.freeze(['creativity','communication','joy','expression','optimism']) }),
  4:Object.freeze({ id:'4', name:'BUILDER', themes:Object.freeze(['stability','discipline','grounding','structure','protection']) }),
  5:Object.freeze({ id:'5', name:'EXPLORER', themes:Object.freeze(['opportunity','adaptability','change','freedom','luck']) }),
  6:Object.freeze({ id:'6', name:'CAREGIVER', themes:Object.freeze(['love','compassion','harmony','wellbeing','responsibility']) }),
  7:Object.freeze({ id:'7', name:'SEEKER', themes:Object.freeze(['intuition','reflection','clarity','wisdom','calm']) }),
  8:Object.freeze({ id:'8', name:'ACHIEVER', themes:Object.freeze(['money','career','ambition','leadership','abundance']) }),
  9:Object.freeze({ id:'9', name:'HUMANITARIAN', themes:Object.freeze(['compassion','emotional_balance','generosity','protection','completion']) })
});
export function getYearArchetype(year) { const digits=String(Math.abs(Number(year)||'')).replace(/\D/g,''); if(!digits)return null; const sum=[...digits].reduce((n,d)=>n+Number(d),0); const root=((sum-1)%9)+1; return LUMI_YEAR_ARCHETYPES[root]; }