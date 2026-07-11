interface GameHowToProps {
  /** Optional extra class (e.g. host lobby sizing). */
  className?: string;
}

const STEPS = [
  {
    title: 'המטרה',
    text: 'לא להישאר עם החבילה כשהפתיל נגמר — אחרת היא מתפוצצת ואתה מפסיד נקודות. מי ששורד בלי פיצוצים צובר יתרון.',
  },
  {
    title: 'יש לך חבילה',
    text: 'אפשר להפעיל יכולות כאוס גם עם החבילה. התקרב לשחקן — יופיע כפתור מסירה. אם הפתיל נגמר אצלך, החבילה מתפוצצת.',
  },
  {
    title: 'תנועה',
    text: 'גע בחלק התחתון של המסך והזז כמו ג׳ויסטיק.',
  },
  {
    title: 'בלי חבילה',
    text: 'השתמש ביכולות כאוס כדי להקשות על מחזיק החבילה לברוח או למסור — כך הפתיל ייגמר אצלו ואתה תתקרב לניצחון.',
  },
  {
    title: 'מכשולים',
    text: 'אי אפשר לעבור דרכם. הסתתר מאחוריהם כדי להימנע ממסירות ומגע — אבל גל יכולת עדיין תופס מי שנכנס לעיגול.',
  },
] as const;

const ABILITIES = [
  {
    title: 'הקפאה',
    text: 'עיגול גדל ממך ל־5 שניות. מי שנכנס אליו מוקפא ל־5 שניות — טוב לעצור את מחזיק החבילה.',
  },
  {
    title: 'גל הדף',
    text: 'עיגול גדל ממך ל־5 שניות. כל מי שבתוך העיגול נדחף החוצה ממך — מרחיק מסירות או פותח מקום לברוח.',
  },
  {
    title: 'מגנט',
    text: 'עיגול גדל ממך ל־5 שניות. מי שנכנס אליו נמשך אליך — מקרב יריבים או את מחזיק החבילה.',
  },
  {
    title: 'בלבול',
    text: 'עיגול גדל ממך ל־5 שניות. מי שנכנס אליו מקבל שליטה הפוכה — מקשה לברוח או למסור.',
  },
] as const;

/** Concise how-to — join screen (phone) and host lobby (TV). */
export function GameHowTo({ className = '' }: GameHowToProps) {
  return (
    <section className={`card join-howto ${className}`.trim()} aria-label="איך משחקים">
      <p className="join-howto-title">איך משחקים?</p>
      <ol className="join-howto-list">
        {STEPS.map((step) => (
          <li key={step.title}>
            <strong>{step.title}:</strong> {step.text}
          </li>
        ))}
      </ol>

      <p className="join-howto-abilities-title">יכולות כאוס — איך הן עוזרות לנצח</p>
      <ul className="join-howto-abilities">
        {ABILITIES.map((ability) => (
          <li key={ability.title}>
            <strong>{ability.title}:</strong> {ability.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
