const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");

// --- Validation & Sanitization Helpers ---
const simpleSanitize = (str) => {
    if (!str) return "";
    // A basic sanitizer to remove HTML tags and trim whitespace
    return str.replace(/<[^>]*>?/gm, '').trim(); 
};

const isValidEmail = (email) => {
    if (!email) return false;
    // A simple regex for email validation. Not perfect, but good for a PoC.
    const re = /\S+@\S+\.\S+/;
    return re.test(String(email).toLowerCase());
};

const MAX_LENGTH = 100; // Define our max length
// --- End Helpers ---


// Get connection string from environment variables
const connectionString = process.env.DB_CONNECTION_STRING;
const client = new CosmosClient(connectionString);
const database = client.database("UserData-DB");
const container = database.container("Users");

module.exports = async function (context, req) {
    context.log('SubmitUser function processed a request.');

    const data = req.body;

    // 1. Check for basic data
    if (!data || !data.firstName || !data.lastName || !data.email) {
        context.res = {
            status: 400, // Bad Request
            body: { message: "All fields are required." }
        };
        return;
    }

    // --- SERVER-SIDE VALIDATION & SANITIZATION ---
    // We *always* sanitize the data first, then validate the result.
    const firstName = simpleSanitize(data.firstName);
    const lastName = simpleSanitize(data.lastName);
    const email = simpleSanitize(data.email);
    
    let errors = [];

    // 2. Validate lengths (after sanitizing)
    if (firstName.length === 0 || lastName.length === 0 || email.length === 0) {
        errors.push("All fields are required.");
    }
    if (firstName.length > MAX_LENGTH || lastName.length > MAX_LENGTH || email.length > MAX_LENGTH) {
        errors.push(`Fields must be ${MAX_LENGTH} characters or less.`);
    }

    // 3. Validate email format
    if (!isValidEmail(email)) {
        errors.push("Please provide a valid email address.");
    }

    // 4. If any errors, reject the request
    if (errors.length > 0) {
        context.res = {
            status: 400, // Bad Request
            // Join all errors into a single message
            body: { message: errors.join(' ') } 
        };
        return;
    }
    // --- END VALIDATION ---

    try {
        // 5. Create the new item using the *sanitized* data
        const newItem = {
            id: crypto.randomUUID(),
            firstName: firstName, // Use the sanitized variable
            lastName: lastName,   // Use the sanitized variable
            email: email,         // Use the sanitized variable
            submittedDate: new Date().toISOString()
        };

        // 6. Save the clean item to Cosmos DB
        const { resource: createdItem } = await container.items.create(newItem);

        context.log(`Created item with id: ${createdItem.id}`);

        // 7. Send a success response
        context.res = {
            status: 201, // 201 = "Created"
            body: { message: `Success! User ${createdItem.firstName} added.` }
        };

    } catch (error) {
        context.log.error('An error occurred:', error);
        context.res = { status: 500, body: "Error writing to database." };
    }
};