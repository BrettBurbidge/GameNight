// The Open Book friends deck, for adults. Nothing is off limits, which is why anyone can pass on any page.
//
// Who answers each page:
//   reader — the person whose turn it is
//   pick   — the reader chooses someone
//   all    — everyone takes a turn; {reader} is replaced with the reader's name

export type PageKind = 'reader' | 'pick' | 'all';

export interface Chapter {
  title: string;
  blurb: string;
  pages: [PageKind, string][];
}

export const CHAPTERS: Chapter[] = [
  {
    title: 'First Pages',
    blurb: 'Stories, bad decisions and strong opinions. Nothing too heavy yet.',
    pages: [
      ['reader', 'What’s the dumbest thing you’ve ever spent real money on?'],
      ['reader', 'What’s a hill you will absolutely die on that doesn’t matter at all?'],
      ['reader', 'What’s the most trouble you ever got into as a kid?'],
      ['reader', 'What job would you be terrible at, and why?'],
      ['reader', 'What’s the worst date you’ve ever been on?'],
      ['reader', 'What’s your most embarrassing drunk story that you’re willing to tell?'],
      ['reader', 'What’s a lie you told as a kid that got way out of hand?'],
      ['reader', 'What did you believe for an embarrassingly long time?'],
      ['reader', 'What’s the pettiest reason you’ve ever stopped liking someone?'],
      ['reader', 'What’s on your phone right now that you’d least like this group to see?'],
      ['reader', 'What’s the worst haircut, outfit or phase you fully committed to?'],
      ['reader', 'What do you pretend to like so people don’t judge you?'],
      ['reader', 'What’s the most illegal thing you’ve done and got away with?'],
      ['pick', 'What’s your most unhinged food opinion?'],
      ['pick', 'What’s the worst advice you’ve ever followed?'],
      ['pick', 'What were you like at fifteen? Be honest.'],
      ['pick', 'What’s the strangest way you’ve ever made money?'],
      ['pick', 'Which of your exes would describe you the worst, and what would they say?'],
      ['pick', 'What are you weirdly competitive about?'],
      ['pick', 'What’s the last thing you searched for that you’d rather not explain?'],
      ['pick', 'What’s a compliment you still think about?'],
      ['pick', 'What’s the most ridiculous thing you’ve done to impress someone you fancied?'],
      ['all', 'Everyone: tell the story of how you met {reader}, the way you remember it.'],
      ['all', 'Everyone: what would {reader} be famous for?'],
      ['all', 'Everyone: who here survives the zombie apocalypse longest, and who goes first?'],
      ['all', 'Everyone: what’s your karaoke song, and how bad is it really?'],
      ['all', 'Everyone: what’s the most {reader} thing {reader} has ever done?'],
      ['all', 'Everyone: what was your worst job?'],
      ['all', 'Everyone: what small thing makes you irrationally angry?'],
      ['all', 'Everyone: who here would you call to help hide a body, and who would you definitely not call?'],
      ['all', 'Everyone: what were you sure you’d have figured out by now?'],
      ['all', 'Everyone: what’s your go-to excuse for getting out of plans?'],
    ],
  },
  {
    title: 'Between the Lines',
    blurb: 'The stuff you usually skip over. Take your time, and pass if you need to.',
    pages: [
      ['reader', 'What do you want that you’re a little ashamed of wanting?'],
      ['reader', 'When did you last cry, and what set it off?'],
      ['reader', 'What’s the worst thing you’ve done to someone who didn’t deserve it?'],
      ['reader', 'What part of your life looks better from the outside than it feels?'],
      ['reader', 'What’s a friendship you lost that you still think about?'],
      ['reader', 'What do you wish your parents had done differently?'],
      ['reader', 'What’s the biggest lie you’ve told someone you love?'],
      ['reader', 'What are you insecure about that nobody here has noticed?'],
      ['reader', 'Who did you love and never tell?'],
      ['reader', 'What have you never forgiven yourself for?'],
      ['reader', 'How do you really feel about your body?'],
      ['reader', 'What’s your relationship with money, honestly, and where did it come from?'],
      ['reader', 'What’s the closest you’ve come to completely falling apart?'],
      ['reader', 'What do you do when you’re alone that would surprise us?'],
      ['pick', 'What’s the truth about your last breakup that you leave out when you tell the story?'],
      ['pick', 'What do you need more of from the people in your life?'],
      ['pick', 'What are you jealous of in someone here?'],
      ['pick', 'What do you wish you’d known about sex or dating ten years ago?'],
      ['pick', 'What habit do you know is hurting you and keep anyway?'],
      ['pick', 'When did you feel most alone?'],
      ['pick', 'What’s the meanest thing anyone has said to you that turned out to be true?'],
      ['pick', 'What are you avoiding right now?'],
      ['pick', 'What do people get wrong about you?'],
      ['pick', 'What were you raised to believe that you’ve had to unlearn?'],
      ['all', 'Everyone: what does {reader} do to themselves that you wish they’d stop?'],
      ['all', 'Everyone: when was {reader} there for you in a way they might not know mattered?'],
      ['all', 'Everyone: what have you never told this group because you thought we’d judge you?'],
      ['all', 'Everyone: what scares you about getting older?'],
      ['all', 'Everyone: what’s one thing you’d change about how you were raised?'],
      ['all', 'Everyone: when were you a bad friend?'],
      ['all', 'Everyone: what do you think {reader} is really afraid of?'],
      ['all', 'Everyone: what are you grieving that nobody asks about?'],
    ],
  },
  {
    title: 'Unedited',
    blurb: 'No filter and no limits. Say the true thing.',
    pages: [
      ['reader', 'What secret have you been carrying that’s getting heavy?'],
      ['reader', 'What’s the darkest place your mind has gone, and what brought you back?'],
      ['reader', 'If you died tomorrow, what would you be most pissed off you never did?'],
      ['reader', 'What have you done sexually that you regret, or regret not doing?'],
      ['reader', 'Who in your life do you love but not actually like?'],
      ['reader', 'What would you do differently if nobody you know would ever find out?'],
      ['reader', 'What’s the hardest thing you’ve had to say to someone, or still haven’t said?'],
      ['reader', 'What do you honestly think happens when we die, and how do you feel about it?'],
      ['reader', 'What about your life right now are you pretending is fine?'],
      ['reader', 'What do you want said at your funeral, and what are you afraid will be said instead?'],
      ['reader', 'Have you ever cheated, or been the one someone cheated with? What’s the real story?'],
      ['reader', 'What decision changed everything for you, and would you make it again?'],
      ['pick', 'What’s the most honest thing you can say about your relationship with drinking or drugs?'],
      ['pick', 'What have you never apologised for that you should?'],
      ['pick', 'What do you want that you’ve given up asking for?'],
      ['pick', 'What’s a truth about your family that you don’t say out loud?'],
      ['pick', 'When have you felt most like a fraud?'],
      ['pick', 'What would break you?'],
      ['pick', 'What have you been wanting to say to someone in this group?'],
      ['pick', 'What are you most afraid we think of you?'],
      ['all', 'Everyone: what’s something hard you’ve wanted to tell {reader}, said with love?'],
      ['all', 'Everyone: what would you miss most about {reader} if they were gone?'],
      ['all', 'Everyone: what did you hear tonight that you’re going to keep thinking about?'],
      ['all', 'Everyone: what do you understand about someone here now that you didn’t a few hours ago?'],
      ['all', 'Everyone: what’s one thing this group should do better for each other?'],
      ['all', 'Everyone: what are you proudest of that you never get to brag about?'],
      ['all', 'Everyone: what do you hope is true about your life in ten years?'],
      ['all', 'Everyone: finish the sentence. “The thing I never say is…”'],
      ['all', 'Everyone: what does {reader} deserve that they don’t give themselves?'],
    ],
  },
];

/** Ways to start a closing note, offered so nobody stares at an empty box. */
export const NOTE_OPENERS = [
  'Something I learned about you tonight: ',
  'What I’ve never told you is ',
  'I hope you know that ',
  'Thank you for ',
];
