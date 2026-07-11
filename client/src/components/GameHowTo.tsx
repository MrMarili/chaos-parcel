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
    text: 'רוץ אל שחקן אחר והתקרב אליו כדי למסור לפני שהפתיל נגמר — אחרת היא מתפוצצת אצלך.',
  },
  {
    title: 'תנועה',
    text: 'גע בחלק התחתון של המסך והזז כמו ג׳ויסטיק.',
  },
  {
    title: 'בלי חבילה',
    text: 'זה הזמן שלך לתקוף: השתמש ביכולות כאוס כדי להקשות על מחזיק החבילה לברוח או למסור — כך הפתיל ייגמר אצלו ואתה תתקרב לניצחון.',
  },
  {
    title: 'מכשולים',
    text: 'אי אפשר לעבור דרכם. הסתתר מאחוריהם — יכולות עובדות רק עם קו ראייה ישיר.',
  },
] as const;

const ABILITIES = [
  {
    title: 'הקפאה',
    text: 'עוצר יריב ל־2 שניות. מקפיאים את מי עם החבילה כדי שיוכל להתפוצץ, או כדי שתוכל להתקרב ולקבל מסירה.',
  },
  {
    title: 'גל הדף',
    text: 'דוחף שחקנים גלויים הרחק ממך. מרחיק את מחזיק החבילה מאחרים (קשה לו למסור) או פותח לך מקום לברוח.',
  },
  {
    title: 'מגנט',
    text: 'מושך אותך למחזיק החבילה. מגיעים מהר כדי לקבל מסירה או ללחוץ עליו כשהפתיל קצר.',
  },
  {
    title: 'בלבול',
    text: 'הופך את כיוון התנועה של יריב. מקשה עליו לברוח, למסור או להסתתר מאחורי מכשול.',
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
