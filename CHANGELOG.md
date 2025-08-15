# # Release 1.3.0

Here is a breakdown of the key developments and improvements made to the project recently.

## 1. Major Features & Integrations

### Stripe Pack Integration

A significant new feature is the integration of the Stripe payment gateway. This allows the application to handle payments, subscriptions, and refunds.
- New Stripe Service: A dedicated service module (src/services/stripe.js) has been created to handle all interactions with the Stripe API, to securely verify incoming webhooks
- Workflow Integration: The Stripe service is now callable from the workflow engine via the new generic ExecuteServiceFunction action, enabling automation of payment-related tasks.
- Secure Configuration: Stripe API keys are now configured securely through user-specific environment variables (STRIPE_SECRET_KEY,  STRIPE_WEBHOOK_SECRET)
- New Dependency: The stripe npm package has been added to package.json.

### AI Provider Generalization & Anthropic Support
The AI Assistant's architecture has been refactored to be more modular and extensible.
- Anthropic (Claude) Support: The assistant now supports Anthropic's models (e.g., Claude) in addition to OpenAI, Google, and DeepSeek.
- Refactored Provider Management: The logic for initializing an AI provider has been centralized.
- New Dependency: The @langchain/anthropic package was added to support this new provider.

### Pack Installation System
- Pack Gallery & Installation: A new UI feature, the "Pack Gallery," was developed, allowing users to browse and install packs from JSON definitions. (see installPack(...) in README.md)
- Markdown Support: To improve the user experience in the gallery, pack descriptions now support Markdown rendering, powered by the react-markdown dependency.

### Workflow Engine Enhancements
The workflow engine has received powerful new capabilities.
- HTTP Request Action: the CallWebhook have been renamed HttpRequest for a workflow action allowing workflows to make external API calls. It supports variable substitution in the URL, headers, and body.
-  Service Execution Action: The new ExecuteServiceFunction action acts as a secure bridge, allowing workflows to run functions from internal modules, such as the new Stripe service.

### API endpoints generation
- Public endpoints are now available (as an option). When activated, authentication will not be activated, and the main user will be used to execute endpoint isolated code.

### Frontend & UI/UX Improvements
Several enhancements were made to the client-side application for a better user experience.
- Improved Rich Text Editor: The translatable rich text editor (RTETrans.jsx) has been improved, likely fixing bugs related to adding/removing languages and managing content for each translation.
- Modernized Checkbox: The CheckboxField in Field.jsx was updated to use a more modern Switch component and its internal state management was fixed.
- You can order Kanban view by enum fields, better cards rendering

# # Release 1.2.6
## Fixed major issues :
- Relation filter constraint is now working
- Fixed an internal import issue with workers on core data module that prevented some processing
- Fixed workflow datafilter for simple conditions-
- db.create(modelName, data) is now working in your engine executed JS scripts

## UI enhancements
- Usage of react-switch for our checkbox field
- Help always displayed as 100% blocks for now , will be rewrittten by atomic field validation issue

## And also
- Workflow actions unit tests (crud, ai content generation, script execution, wait...)
- Test : Trigger dataFilter: should launch the workflow only if matches.
- Test for failure step in workflow

# Release 1.2.5 (unstable)

We're excited to announce several powerful new features and improvements in our latest release, focusing on data integrity and import capabilities.

## What's Changed

* Add composite unique constraints by @anonympins in https://github.com/anonympins/data-primals-engine/pull/105
* split data modules in two parts by @anonympins in https://github.com/anonympins/data-primals-engine/pull/107
* css model creator fields by @anonympins in https://github.com/anonympins/data-primals-engine/pull/110
* Resolved importer view + read excel files by @anonympins in https://github.com/anonympins/data-primals-engine/pull/112
* added previsualisation for excel data (and translations) by @anonympins in https://github.com/anonympins/data-primals-engine/pull/113


## Issues

- We've resolved the regression in our Server-Sent Events implementation that powers real-time import progress tracking.
- Fixed missing imports on engine routes

## Unique constraints

You can now use unique constraints as is :
```javascript
{
    "name": "modelName",
    "fields": [
         { "name": "fieldName1", .... },
         { "name": "fieldName2", .... }
    ],
    "constraints": [
        // composite unique constraint with two fields
        { "name": "uniqueConstraint", type: "unique", keys: ["fieldName1", "fieldName2"] }
    ]
}
```
Key benefits:

- Prevent duplicate entries at database level
- Support for multi-field uniqueness constraints
- Seamless integration with existing validation systems
- Constraint violations return clear error messages
## Import Excel Data sheets

You can now import excel data sheets (.xlsx) from the UI, using same tool as for CSV and JSON files.
A mapper is available to extract data from your file and this makes it easy to import data to your models, with our previsualisation tool.

These enhancements continue our commitment to making data management more powerful and accessible. The new unique constraints provide essential data integrity protection, while our expanded import capabilities make it easier than ever to bring your existing data into the system.

For implementation details or migration guidance, please consult our updated documentation or contact our support team.

# Release 1.2.4 (unstable)

## Enhancements

- #65 mTLS support (MongoDB)

- #89 Add DeepSeek support for AI assistance

- #62 Handling dates in Condition Builder

Use the MongoDB aggregation operators $dateAdd / $dateSubtract / $dateDiff / $dateToString to deal with advanced dates, like any other operator in the interface. You can specify a field name instead of a date value to enable dynamic calculation.

- Better loading of modules : you can use out of the box modules filepaths to enhance your engine instance, it works with a module directory also (you must define an `index.js` or `[moduleName].js`). See CONTRIBUTING.md

## Issues

- Fixed an issue with AI model names not being interpreted
- Cleaned unwanted engine logs
- Fixed imports and unwanted self dependency


# Release 1.2.3 (stable)

We're excited to announce the release of version 1.2.3 of Data Primal Engine! This update introduces a powerful new Marketing & Campaigning pack, alongside several key improvements and bug fixes to enhance stability, usability, and provide a more robust out-of-the-box experience.

---

## 🚀 New Feature: Marketing & Campaigning Pack

Take your communication to the next level! This new starter pack is designed to help you launch powerful, personalized, and scalable email campaigns directly from the engine.

**Key Highlights:**

*   **Scalable Email Blasts:** The pack includes a pre-configured workflow that intelligently sends emails in chunks. This prevents server overloads and ensures high-performance delivery, even for large audiences.
*   **Dynamic Audiences:** Define dynamic contact segments using powerful filters. Target the right users with the right message, every time.
*   **Fully Customizable:** While the pack provides a ready-to-use solution, the entire workflow—from audience selection to email content—can be easily customized to fit your specific needs.
*   **Context-Aware Personalization:** Leverage the full power of workflow variables to personalize email subjects and content for each recipient.

This pack depends on the 'Customer Relationship Management (CRM)' pack and is perfect for product announcements, newsletters, and targeted marketing initiatives.

---

## ✨ Improvements & Bug Fixes

*   **Default Pack Installation:** To provide a richer out-of-the-box experience, all starter packs are now installed by default upon initial setup. This gives you immediate access to a wide range of functionalities, including the new Marketing pack, E-commerce kit, and CRM.

*  🔧  **Client-Side Filter Fix:** Resolved an issue where condition filters in the client-side UI were not being applied correctly, ensuring more accurate data visualization and management.

*   **Enhanced SMTP Configuration:** Improved the handling of SMTP environment variables. The system now more reliably uses user-specific SMTP settings and gracefully falls back to the default configuration, ensuring consistent email delivery.

*  🔧  **Robust Variable Substitution:** Fixed a critical bug in the workflow engine to allow all recursive content to be substituted by variables. This allows deep content replacing (needed for emails)

* 🔧 **Fixed Isolation Issue** – Previously, some calls were not recognized due to the migration to isolated-vm. This has been resolved, ensuring full compatibility and stability.


# Release 1.2.2

This release includes two main improvements :

## File storage on Amazon S3 buckets
- addFile / removeFile now uses S3 user configuration
- S3 configuration and AWS_* keys are stored in env model by default, so by user for flexibility.

## Engine extensibility

- This feature covers basics for easy core extensibility

Just use

```javascript
Event.Listen("OnDataAdded", (data) => {
     my_callback()
}, "event", "user");
```

or the system version
```javascript
Event.Listen("OnDataAdded", (engine, data) => {
     my_callback()
}, "event", "system");
```

Events available for 'system' :
- OnServerStart
- OnServerStop
- OnModelsLoaded
- OnModelsDeleted
- OnUserDataDumped
- OnDataRestored
- OnPackInstalled
- OnModelEdited / OnDataAdded / OnDataDeleted / OnDataSearched / OnDataExported also available for users.


# Release 1.2.1

This release introduces a major evolution of our user permission management system. The goal is to move beyond a simple role-based model to allow for fine-grained, individual, and temporary adjustments to access rights.
This new approach offers significantly increased flexibility for advanced use cases, such as granting temporary access to a feature, overriding a specific right without changing the user's roles, or managing exceptions for particular users.

## Key Changes

### New userPermission Model
A new userPermission data model has been added (src/defaultModels.js). It links a user (user), a permission (permission), and a grant status (isGranted).
This model includes an optional expiresAt field, making these exceptions temporary and allowing rights to be granted or revoked for a limited duration.
### New Permission Calculation Logic (getUserActivePermissions)
The new getUserActivePermissions function (src/modules/user.js) is the core of this system.
It operates in two steps:
It first collects all base permissions derived from the user's roles.
It then applies all active (non-expired) exceptions (grants or revocations) defined in the userPermission documents.
This logic is implemented using efficient MongoDB aggregation pipelines for effective calculation directly within the database.
### Update to hasPermission Function
- The public hasPermission function has been refactored to use the new getUserActivePermissions logic for all local users, ensuring that rights checks account for this new system.
- Backward compatibility is maintained for non-local users (e.g., system users).
### Comprehensive Integration Tests
- A new test file, test/user.test.js, has been created to exhaustively validate the new permission system.
- The tests cover multiple scenarios, including:
    - Correct inheritance of permissions from roles.
    - Granting of permanent and temporary permissions.
    - Ignoring expired permissions.
    - Revoking a permission inherited from a role.
    - Restoring a permission after its revocation has expired.
### How to Test
The new functionality is fully covered by integration tests. To verify the changes, you can run the test suite, paying special attention to user.test.js:

## Other improvements :

- Datepickers are now available when using date related MongoDB operators like $hour, $minute...
- Model creation is more visually attractive
- README updates

# Release 1.2.0

## Issues
Fixed imports + Upload directory creation

## Enhancements

Assistant has been rewritten ( using AI too ) to help users accordingly to their needs :

- It can now search in your models (by keyword) to help find good models (almost for free).
- "Give AI tools and they will grow accordingly"
- Then it executes other reflective steps to find the data in the model (using a MongoDB constructed filter)
- It then displays a message to the user

Maximum number of steps can be defined in src/constants.js : `maxAIReflectiveSteps`

No more restriction when not needed.
Simple commands should just work like "Find the last requests in the last two days that request for data model"
It just do what it has to do.

For insertion, update and deletion, you have to confirm the filter and the request to make it happen

- better README

## Breaking changes in 1.2.0

In order to have a form of uniformization between our different data operation methods
we try to follow the syntax method(...args, user) and have filter in one simplified block passed

deleteData can now handle ids and filter in the same parameter "filter"

# Release 1.1.8
## Enhancements

- Added data integrity check when using relationFilter property for relation fields (+ unit tests)
- README cool badges 👍
- Endpoint generation explanations in README
- New TLS options, that accept default TLS connection mode. mTLS will follow.

## Issues
- Fixed an issue with unicode usernames when dumping and restoring data
- The mongodb dump/restore methods are now well protected against command injection. Our security tab should evolve with this functionality.

# Release 1.1.7

## Tutorial system
- Tutorials are now available in the client interface. You can follow the trame created in client/src/tutorials.js or just modify it to your convenience. It uses completion conditions to run, and stages to order the user journey.

## Other enhancements
- You can choose your preferred language in the topbar. It will only load these resources, and unload previous ones.
- Website translations are now working for the open-source client
- Better TLS support (more consts)
- Crypto fallback for the getRandom() method

# Release 1.1.6
## Security enhancements
- MongoDB TLS options for full secured connection to database
- Added a protection against prototype injection helper and fixed a related security breach
- Permissions on GitHub workflow to run
- Added secured browser randomness like reported in GitHub code analysis

## Bugfixes
- Fixed an issue with preventing PUT /api/model requests to work
- Fixed failure code on uncaught exception

## Other
- Migration subdirectory in project base dir

# Release 1.1.5
## Enhancements
- Express application is now transmittable to the engine
- README update
- Support for AI server access if no user environment variable is configured

## UI improvements
- Duplicate data easily by using the data editor
- Configure advanced filters in the interface, by using the condition builder
- Stores the filters in local storage, for user next session access. (saving other filters will be in a next release)

## Bugfixes

- Website all in one pack installation fixed (for roles mainly)
- Tourpoint is now responsive to latency
- Fix search request when using relations with corrupted data (that should not occurs, but...)

# Hotfix 1.1.4
## Fixes

This is a hotfix for previous hotfix library import resolution :

- No more external dep to data-primals-engine in client
- Peer dependencies are now limited to strict minimum for client integration in other systems
- Missing consts in previous package

# Hotfix 1.1.3
VM2 has a big security issue , see https://gist.github.com/leesh3288/f693061e6523c97274ad5298eb2c74e9
The server crushed down when using this injection so we had to find a solution. We changed the piepeline to Node 20 and used isolated-vm for best security support.

Fixed an import issue too.

# Release 1.1.2 (unstable)

## Enhancements

### Endpoint generation
Users can now add custom endpoints by using the 'endpoint' model.
When activated, it will trigger the route on top of the /api, for your user only.
Your Javascript code is then executed to deliver the response.

### CTA generation
Endpoints does not come without CTA. And we needed a technical implementation of the customization of the button.
Flex Builder can now add these CTA buttons into your dashboard and for example execute a delete request on your item

More script actions will be provided in the future but you can already do CRUD operations , do logs and get your env variables.

### Release 1.1.1
## Issues:

- Fix real issue with translating website frontend

## Enhancements :

- package.json cleaned
- Updated README.md with data types and configurable environment keys (for AI generation, emails and backups)
- Added safe javascript execution using ExecuteScript workflowTrigger for now (you can execute your own JS methods)
  More features will be provided in relation to code execution in the future, including custom endpoint generation, and code helpers
# Release 1.1.0
## Better overall quality of the package

- more exportable modules
- eslint configuration

## Features :

- changed order product relation to the cartItem model (for simplicity)
- getCollectionForUser is now async
- User providers have now access to :
    - user plans and features (one accepted : 'indexes' that creates indexes automatically)
    - backup frequency by user
    - storage limit by user

You can also define user (express) middlewares like limiters, authentication layers...

New client subpackage for launching the data editor on localhost. See npm scripts in package.json

# Release 1.0.11
Translations of the API for remaining data.primals.net supported languages :

- Greek (el)
- Russian (ru)
- Italian (it)
- Czech (cs)
- Swedish (sv)

# Release 1.0.10

### Features :
- Deutch / Spanish translations of the API
- More exported utility methods for the API (see README.md for details)

### Other enhancements :
- Model edition unit tests

### 
Thanks to Deepseek for his hard work on translations

# Release 1.0.9
**Integration tests :**

- Data integrity checks
- Data import export integrity check
- Shared resources and User/model isolation in tests
- CI/CD Pipeline configuration by Github Actions, and using a mongodb service container to simulate real env.
- Dockerfile

# Release 1.0.8

**Issues resolved**
- Fix issue with validating boolean not required fields
- Fix imports to make the lib works

**Features**
- getDataAsString can now get date and datetime localized human strings
- Better support for worklow variable substition (models are now connected relation by relation to retrieve the data)

**Breaking changes**
- Loading modules is now in engine creation (await Engine.Create())

# Release 1.0.7
- Full models translations in French / English / Arabic / Persan languages.
- Cookies secret is now configurable
- Cleaned some consts

# Release 1.0.6
- better assistant filter comprehension of MongoDB expression

# Release 1.0.5
- Better assistant (filters are handled by complete MongoDB examples)
- Cleaned repository from data.primals.net connections (tutorials)
- Readme update
- Fixed an issue with handling complex string transliteration from objects

## What's Changed
* Release 1.0.5 by @anonympins in https://github.com/anonympins/data-primals-engine/pull/7
  **Full Changelog**: https://github.com/anonympins/data-primals-engine/compare/data-primals-engine...data-primals-engine-1.0.5


### Release < 1.0.5 are not stable enough