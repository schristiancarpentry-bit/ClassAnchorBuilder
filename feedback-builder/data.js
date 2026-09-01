/* ClassAnchor Feedback Builder — data model
 * Tier ladder + default slider bank, grounded in common City & Guilds /
 * NVQ-style practical performance-criteria groupings (Health & Safety,
 * Tools & Equipment, Technique & Process, Quality & Accuracy, Knowledge &
 * Understanding, Employability & Behaviours, Planning & Preparation).
 * Exact criteria vary by qualification and sector — every slider here is
 * editable, and tutors can add their own from the same picker.
 */
(function (global) {
  "use strict";

  // ---- 1–10 qualifier ladder -------------------------------------------
  // Each slider's paragraph is built as: `${subject} ${qualifier} ${verbPhrase}.`
  // plus an optional flag suffix at the extremes.
  var TIERS = [
    { v: 1,  label: "Not Met",            band: "not-met",   qualifier: "did not, on this occasion, demonstrate the ability to" },
    { v: 2,  label: "Well Below Standard", band: "not-met",   qualifier: "showed very limited ability to" },
    { v: 3,  label: "Below Standard",      band: "developing", qualifier: "showed limited ability to, and needed considerable support to" },
    { v: 4,  label: "Developing",          band: "developing", qualifier: "showed a basic, inconsistent ability to" },
    { v: 5,  label: "Developing Well",     band: "developing", qualifier: "showed a developing ability to, and needed regular support to" },
    { v: 6,  label: "Approaching Standard", band: "meeting",  qualifier: "was able, with occasional prompting, to" },
    { v: 7,  label: "Meeting Standard",    band: "meeting",   qualifier: "was consistently able to" },
    { v: 8,  label: "Meeting Well",        band: "meeting",   qualifier: "confidently and consistently was able to" },
    { v: 9,  label: "Exceeding Standard",  band: "exceeding", qualifier: "demonstrated a strong, largely independent ability to" },
    { v: 10, label: "Exceeding Fully",     band: "exceeding", qualifier: "demonstrated an outstanding, fully independent ability to" }
  ];

  var BAND_META = {
    "not-met":   { name: "Not Met",   color: "#b23a34" },
    "developing":{ name: "Developing", color: "#c07a1f" },
    "meeting":   { name: "Meeting",    color: "#45636a" },
    "exceeding": { name: "Exceeding",  color: "#3f7d52" }
  };

  var CATEGORIES = [
    { id: "hs",        name: "Health & Safety" },
    { id: "tools",     name: "Tools & Equipment" },
    { id: "tech",      name: "Technique & Process" },
    { id: "quality",   name: "Quality & Accuracy" },
    { id: "knowledge", name: "Knowledge & Understanding" },
    { id: "behaviour", name: "Employability & Behaviours" },
    { id: "planning",  name: "Planning & Preparation" },
    { id: "custom",    name: "My Sliders" }
  ];

  // ---- default slider bank ----------------------------------------------
  var DEFAULT_SLIDERS = [
    // Health & Safety
    { id: "hs-ppe",           category: "hs", name: "PPE Use",
      verbPhrase: "select and correctly wear the appropriate personal protective equipment (PPE) throughout the task",
      description: "Correct selection and consistent wearing of PPE." },
    { id: "hs-safe-practice", category: "hs", name: "Safe Working Practices",
      verbPhrase: "follow safe working procedures and workshop/site rules throughout the task",
      description: "Adherence to safe systems of work and site/workshop rules." },
    { id: "hs-risk",          category: "hs", name: "Risk & Hazard Awareness",
      verbPhrase: "identify hazards and take appropriate action to minimise risk to themselves and others",
      description: "Spotting hazards and acting to reduce risk." },
    { id: "hs-tool-checks",   category: "hs", name: "Pre-Use Equipment Checks",
      verbPhrase: "carry out pre-use safety checks on tools and equipment before starting work",
      description: "Checking tools/equipment are safe to use before starting." },
    { id: "hs-housekeeping",  category: "hs", name: "Workspace Housekeeping",
      verbPhrase: "keep the work area clean, tidy and free from hazards throughout and after the task",
      description: "Tidiness and hazard-free housekeeping during and after work." },
    { id: "hs-emergency",     category: "hs", name: "Emergency Procedures",
      verbPhrase: "respond appropriately to emergency situations and follow correct reporting procedures",
      description: "Correct response to and reporting of emergencies/incidents." },

    // Tools & Equipment
    { id: "tools-hand",     category: "tools", name: "Hand Tool Use",
      verbPhrase: "select, hold and use hand tools safely, correctly and with appropriate technique",
      description: "Safe, correct handling and technique with hand tools." },
    { id: "tools-power",    category: "tools", name: "Power Tool / Machine Use",
      verbPhrase: "select and operate power tools and machinery safely and correctly for the task",
      description: "Safe, correct operation of power tools/machinery." },
    { id: "tools-selection",category: "tools", name: "Tool & Equipment Selection",
      verbPhrase: "select the correct tools and equipment for the task in hand",
      description: "Choosing the right tool/equipment for the job." },
    { id: "tools-care",     category: "tools", name: "Tool Care & Maintenance",
      verbPhrase: "clean, maintain and store tools and equipment correctly after use",
      description: "Cleaning, maintaining and storing tools/equipment properly." },
    { id: "tools-setup",    category: "tools", name: "Equipment Setup & Calibration",
      verbPhrase: "set up, adjust and calibrate tools or equipment correctly before use",
      description: "Correct setup, adjustment and calibration before use." },

    // Technique & Process
    { id: "tech-measuring",   category: "tech", name: "Measuring & Marking Out",
      verbPhrase: "measure and mark out materials or work accurately using appropriate methods",
      description: "Accurate measuring and marking out." },
    { id: "tech-sequence",    category: "tech", name: "Following a Logical Sequence",
      verbPhrase: "carry out the task in a logical, correct sequence in line with the method or specification",
      description: "Working through the task in the right order." },
    { id: "tech-materials",   category: "tech", name: "Material Selection & Preparation",
      verbPhrase: "select and prepare the correct materials or components for the task",
      description: "Choosing and preparing the right materials/components." },
    { id: "tech-dexterity",   category: "tech", name: "Technique & Manual Dexterity",
      verbPhrase: "apply correct technique, handling and manual dexterity when carrying out practical operations",
      description: "Physical technique and handling skill during practical work." },
    { id: "tech-instructions",category: "tech", name: "Following Instructions & Specifications",
      verbPhrase: "interpret and follow written or verbal instructions, drawings and specifications correctly",
      description: "Correctly interpreting and following instructions/drawings/specs." },
    { id: "tech-problem",     category: "tech", name: "Problem Solving",
      verbPhrase: "identify and resolve problems that arise during the task, adapting their approach where necessary",
      description: "Spotting and working through problems as they arise." },
    { id: "tech-adapt",       category: "tech", name: "Adapting to Change",
      verbPhrase: "adapt working methods appropriately when conditions, materials or instructions change",
      description: "Adjusting method when conditions or requirements change." },

    // Quality & Accuracy
    { id: "quality-accuracy",   category: "quality", name: "Accuracy & Tolerance",
      verbPhrase: "work within the accuracy and tolerances required for the task",
      description: "Working within the required tolerances." },
    { id: "quality-finish",     category: "quality", name: "Quality of Finish",
      verbPhrase: "produce finished work of a high standard, free from avoidable defects",
      description: "Standard and neatness of the finished work." },
    { id: "quality-detail",     category: "quality", name: "Attention to Detail",
      verbPhrase: "check their work at each stage and identify and correct errors before proceeding",
      description: "Checking and correcting work at each stage." },
    { id: "quality-consistency",category: "quality", name: "Consistency of Standard",
      verbPhrase: "maintain a consistent standard of work throughout the task",
      description: "Keeping quality consistent from start to finish." },
    { id: "quality-outcome",    category: "quality", name: "Meeting the Brief / Outcome",
      verbPhrase: "produce a final outcome that meets the requirements of the brief or specification",
      description: "Whether the finished outcome meets the brief." },

    // Knowledge & Understanding
    { id: "know-underpinning", category: "knowledge", name: "Underpinning Knowledge",
      verbPhrase: "explain the reasoning behind their actions and decisions, showing understanding of underpinning theory",
      description: "Explaining the 'why' behind actions, showing theory understanding." },
    { id: "know-terminology",  category: "knowledge", name: "Use of Technical Terminology",
      verbPhrase: "use correct technical language and terminology relevant to the task",
      description: "Correct use of trade/technical terminology." },
    { id: "know-standards",    category: "knowledge", name: "Understanding of Standards & Regulations",
      verbPhrase: "demonstrate understanding of relevant industry standards, codes of practice or regulations",
      description: "Understanding of relevant standards/regulations/codes of practice." },
    { id: "know-questions",    category: "knowledge", name: "Response to Questioning",
      verbPhrase: "answer assessor questioning confidently and accurately, showing depth of understanding",
      description: "Quality of answers given to assessor questioning." },

    // Employability & Behaviours
    { id: "beh-time",           category: "behaviour", name: "Time Management",
      verbPhrase: "plan and complete the task within the time allocated",
      description: "Completing the task within the time available." },
    { id: "beh-independence",   category: "behaviour", name: "Independence",
      verbPhrase: "work independently, seeking help or guidance only when appropriate",
      description: "Working without unnecessary reliance on support." },
    { id: "beh-communication",  category: "behaviour", name: "Communication",
      verbPhrase: "communicate clearly and appropriately with the assessor, peers or customers throughout the task",
      description: "Clarity and appropriateness of communication." },
    { id: "beh-teamwork",       category: "behaviour", name: "Teamwork",
      verbPhrase: "work effectively and co-operatively as part of a team",
      description: "Cooperation and effectiveness working with others." },
    { id: "beh-professionalism",category: "behaviour", name: "Professionalism & Attitude",
      verbPhrase: "conduct themselves professionally, showing a positive attitude and commitment to the task",
      description: "Professional conduct and positive attitude." },
    { id: "beh-customer",       category: "behaviour", name: "Customer Service",
      verbPhrase: "interact with customers or clients in a professional, courteous and helpful manner",
      description: "Quality of customer/client-facing interaction." },
    { id: "beh-punctuality",    category: "behaviour", name: "Punctuality & Attendance",
      verbPhrase: "attend punctually and demonstrate reliable, professional conduct throughout the session",
      description: "Punctuality and reliability." },

    // Planning & Preparation
    { id: "plan-task",        category: "planning", name: "Planning the Task",
      verbPhrase: "plan the task effectively, identifying the steps, resources and time needed before starting",
      description: "Effective up-front planning of steps, resources and time." },
    { id: "plan-environment", category: "planning", name: "Environmental & Sustainable Practice",
      verbPhrase: "carry out the task in a way that minimises waste and reflects good environmental practice",
      description: "Waste minimisation and environmental good practice." },
    { id: "plan-review",      category: "planning", name: "Self-Review & Reflection",
      verbPhrase: "review their own work and reflect on how it could be improved",
      description: "Quality of self-review and reflection." }
  ];

  // ---- sentence generation ----------------------------------------------
  function tierFor(value) {
    var v = Math.max(1, Math.min(10, Math.round(Number(value) || 1)));
    return TIERS[v - 1];
  }

  function subjectFor(studentName) {
    var n = (studentName || "").trim();
    return n ? n.split(/\s+/)[0] : "The learner";
  }

  // Build the generated (non-overridden) sentence for a slider at a given value.
  function generateSentence(slider, value, studentName) {
    var t = tierFor(value);
    var subject = subjectFor(studentName);
    var s = subject + " " + t.qualifier + " " + slider.verbPhrase + ".";
    if (t.v === 1) s += " This is a priority area for further development.";
    if (t.v === 10) s += " This was a clear strength.";
    return s;
  }

  function overallBand(average) {
    if (average >= 9) return { label: "an outstanding overall performance, consistently exceeding the standard expected" };
    if (average >= 7) return { label: "a strong overall performance, meeting the standard expected in most areas" };
    if (average >= 5) return { label: "a developing overall performance, with several areas still requiring further practice and support" };
    if (average >= 3) return { label: "significant gaps in performance, requiring focused improvement and additional support before the standard is met" };
    return { label: "very limited evidence of meeting the required standard at this time, and will need substantial further practice and support" };
  }

  global.FeedbackData = {
    TIERS: TIERS,
    BAND_META: BAND_META,
    CATEGORIES: CATEGORIES,
    DEFAULT_SLIDERS: DEFAULT_SLIDERS,
    tierFor: tierFor,
    subjectFor: subjectFor,
    generateSentence: generateSentence,
    overallBand: overallBand
  };
})(window);
