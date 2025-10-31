# Cletus

Cletus is a CLI agent that shows how to use @aits

## Features
- Saved chats (with titles, assistant, & custom prompt)
- Custom assistants (custom personas)
- Image generation & editing
- File & content searching
- File & directory creation
- File/folder indexing for semantic searches
- Multiple chat modes
- You can design your own data types
- You can search, create, updated, and delete your own data
- Everything is stored locally as JSON
- Data & indexed files can be semantically searched
- Memory management

## Start-up Procedure
- Does .cletus/config.json exist? (.cletus folder is expected to be at the users home directory)
  - NO, lets walk through a wizard to create it
    - Look at process.env.OPENAI_API_KEY
    - Look at process.env.OPENROUTER_API_KEY
    - Look at process.env.REPLICATE_API_KEY
    - For each potential provider say whether a key was detected and given them the option to use it.
    - For each provider there was no key detected let them enter one in.
    - We save what providers they want and their options in config.json, see format below.
    - We ask them their name & pronouns to save it
    - We ask them if there's anything we should always remember when talking to them
    - Create .cletus/config.json, .cletus/knowledge.json, .cletus/data/, .cletus/chats/
- Validate all .cletus json files - fail client if any are invalid explaining which one is corrupted
- Display chats and let the user select a chat (should be a scrollable list) OR start a new chat
- The chat procedure is then followed (described in AC-2.md)

## Cletus files
All files are in JSON and validated based on schemas defined in Cletus' code.
All files are stored in `path.join(os.homedir(), './cletus')`

### config.json
Example of file structure.
The given assistants are created during initialization all the time.

```json
{
  "updated": 3434535,
  "user": {
    "name": "The name they entered",
    "pronounts": "he/him",
    "memory": [
      {
        "text": "Things we should always remember",
        "created": 83467578
      }
    ]
  },
  "providers": {
    "openai": {
      "apiKey": "sk-blah-blah"
    },
    "openrouter": null,
    "replicate": {
      "apiKey": "sk-blah-blah"
    }
  },
  "assistants": [
    {
      "name": "Gollum",
      "prompt": "You are Gollum from The Lord of the Rings. When interacting with the user you MUST ONLY talk like Gollum talks. Be helpful and just a tiny tricksy.",
      "created": 2345345
    },
    {
      "name": "Harry Potter",
      "prompt": "You are Harry Potter. When interacting with the user add magic spell casting to all of your replies.",
      "created": 2345345
    },
    {
      "name": "Sherlock Holmes",
      "prompt": "You are Sherlock Holmes, you know all about him, you speak just like him, and you think extra hard about things. Nothing gets passed you.",
      "created": 2345345
    },
    {
      "name": "Comic",
      "prompt": "You are a Comic that helps the user but when it sees a joke it can make in the process it always makes it.",
      "created": 2345345
    }
  ],
  "chats": [
    {
      "id": "random UUID and the messages are stored at .cletus/chats/[id].json",
      "title": "AI generated title that's no more than 10 words",
      "assistant": "The name of the current assistant in the chat if any",
      "prompt": "Custom prompt in the chat if any",
      "mode": "read",
      "created": 3985743,
      "updated": 883453,
      "todos": [
        { "name": "Find 10 images that are related to Hobbiton", "done": true, "id": "uuid" },
        { "name": "Make an image for each one placing the user in each one", "done": false, "id": "uuid" }
      ]
    }
  ],
  "types": [
    {
      "name": "unique_name_used_as_filename_immutable",
      "friendlyName": "The human friendly name of this data type, can be changed",
      "description": "A description if any",
      "fields": [
        {
          "name": "unique_field_name_immutable",
          "friendlyName": "Human friendly name",
          "type": "string or number or boolean or date or enum or name of another data type",
          "default": "defaultValue",
          "required": true,
          "enumOptions": ["A", "B"]
        }
      ]
    },
    {
      "name": "task",
      "friendlyName": "Task",
      "description": "A task you would like to keep track of to complete",
      "fields": [
        {
          "name": "name",
          "friendlyName": "Name",
          "type": "string",
          "required": true
        },
        {
          "name": "details",
          "friendlyName": "Details",
          "type": "string",
          "default": ""
        },
        {
          "name": "createdAt",
          "friendlyName": "Created",
          "type": "date"
        },
        {
          "name": "dueAt",
          "friendlyName": "Due",
          "type": "date"
        },
        {
          "name": "doneAt",
          "friendlyName": "Done",
          "type": "date"
        },
        {
          "name": "cancelledAt",
          "friendlyName": "Cancelled",
          "type": "date"
        }
      ]
    }
  ]
}
```
- `updated` and `created` are timestamps of those events respectively
- `assistants` are auto-generated so they have some to work with
- `types` are auto-generated to have an example of one to work with (just task example)
- `chats` are auto-sorted by most recent
- `providers` are openai, openrouter, and replicate and match the config types in each provider OR null if it's not an available provider

### knowledge.json
Stores text & vectors from data and indexed files

`{ [embeddingModel: string]: Array<{ source: string, text: string, vector: number[], created: number, updated?: number }> }`

```json
{
  "updated": 215354245,
  "knowledge": {
    "text-embedding-large": [
      {
        "source": "task:213",
        "text": "Task [name] ([details]) is not yet complete and it's due due [due]",
        "vector": [0, 1, 0],
        "created": 314531,
        "updated": 353351
      },
      {
        "source": "fileSummary:/path/to/file.txt",
        "text": "A summary of the first 64k characters of the file above",
        "vector": [0, 1, 0],
        "created": 314531
      },
      {
        "source": "fileChunk:/path/to/file.txt[0]",
        "text": "A chunk from the file individually embedded",
        "vector": [0, 1, 2],
        "created": 314531
      }
    ]
  }
}
```

### chats/\[id\].json

This stores the message history of the chat.

```json
{
  "updated": 215354245,
  "messages": [
    {
      "role": "user",
      "message": [
        {
          "type": "text",
          "content": "how are you? can you tell me what you see in this image?"
        },
        {
          "type": "image",
          "content": "file://path or data: or https:// - same for image, file, or audio type"
        }
      ],
      "created": 1523,
      "tokens": 1204
    },
    {
      "role": "assistant",
      "name": "Harry Potter",
      "content": [
        {
          "type": "text",
          "content": "Looks like a picture of a wombat"
        }
      ],
      "created": 1523,
      "tokens": 1204
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "content": "Can you create me an image like that accept with a squirrel?"
        }
      ],
      "created": 1523,
      "tokens": 1204
    },
    {
      "role": "assistant",
      "name": "Harry Potter",
      "content": [
        {
          "type": "image",
          "content": "data:image/png;base64,..."
        },
        {
          "type": "text",
          "content": "Here you go!"
        }
      ],
      "created": 1523,
      "tokens": 1204,
      "todo": "uuid of todo if linked to one",
      "operation": {
        /* operation type, payload, start, end, error, and results  */
      }
    }
  ]
}
```

### data/\[name\].json

This stores data for a given type.

```json
{
  "updated": 215354245,
  "data": [
    {
      "id": "randomly generated uuid",
      "created": 343453,
      "updated": 345245,
      "fields": {
        "name": "We need to do the thing!",
        "details": "It's very important",
        "dueAt": "2025-11-4"
      }
    }
  ]
}
```

## Technical Decisions
- All JSON files have a schema defined in the code and should be validated. The schemas should be very strict for cletus system files.
- AppContext for Cletus passes down a Config class which is parsed from the file - and you can make changes to it and it auto-saves. `const ai = AI.with<AppContext>().providers(providers).create({})`
- ChatContext extends AppContext and has the current chat and messages objects. `const aiChat = ai.extend<ChatContext>()`.
- All the JSON data is converted to class instances that has helpful functions. Each file has an updated and before save the number in memory is compared to what's in the file and errors if there's a difference (concurrent updates made by another instance). Each file type has a `file.save(async (current) => { /* applies changes to current and then once done the file will be attempted to be saved*/ })`
- Don't worry about implementing the chat prompts, agents, and tools. Just enough work to get things started.