# Gemini wiki job - all prompts (in order of use)

Attach WEB-GEMINI-ALL.md to the first message.

## 1. First message (with WEB-GEMINI-ALL.md attached)
Follow the instructions in the attached file exactly. Start now with entries 1-250.

## 2. After every reply (about 5 times)
c

## 3. If Gemini goes back to small batches
Use batches of 250 entries. Continue with the next entries, no repeats.

## 4. If a reply is cut off in the middle
Your last reply was cut off. Output again ONLY the entries from <first missing id> to the end of that batch, as one valid JSON block, then the REPORT line.

## 5. If entries were skipped (ids listed by the merge script)
These ids were missing from your output: <id1>, <id2>, ... Write them now in the same format (one JSON block + REPORT line).

## 6. If JSON is invalid or lengths are wrong
Rewrite these ids so summary is 70-140 characters and flavor is 220-420 characters, valid JSON only: <id1>, <id2>, ...

## After the end (PowerShell, in D:\ROM 2 clone\game)
Paste all Gemini replies into .planning\gemini\replies.txt, then:
node tools/merge-gemini-wiki.mjs .planning/gemini/replies.txt
Then tell Claude "done".
