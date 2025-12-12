// Migration script to fix old chat format where content was a string
const fs = require('fs');
const path = require('path');

const chatFile = process.argv[2];
if (!chatFile) {
  console.error('Usage: node migrate-chat.js <path-to-chat-file>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(chatFile, 'utf-8'));

let migrated = 0;
data.messages.forEach((msg, index) => {
  // Check if content is a string (old format)
  if (typeof msg.content === 'string') {
    console.log(`Migrating message ${index}: ${msg.role}`);
    msg.content = [{
      type: 'text',
      content: msg.content
    }];
    migrated++;
  }
});

if (migrated > 0) {
  fs.writeFileSync(chatFile, JSON.stringify(data, null, 2));
  console.log(`✓ Migrated ${migrated} message(s)`);
} else {
  console.log('No messages need migration');
}
