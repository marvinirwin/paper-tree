import fs from 'fs';
import {ChatGPTAPI} from "chatgpt";
import readline from 'readline';

interface DocumentNode {
    document: string;
    context: string;
    prompt: string;
    children: DocumentNode[];
}
let documentNodes: DocumentNode[] = [];
const api = new ChatGPTAPI({
    apiKey: process.env.OPENAI_API_KEY as string,
    completionParams: { model: 'gpt-4-0613' },
    maxModelTokens: 8100
});
const cacheFile = './chatgpt-cache.json';
const cache = fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
    : {};
export const queryChatGPT = async (prompt: string): Promise<string> => {
    if (cache[prompt]) {
        return cache[prompt];
    }

    return await api
        .sendMessage(prompt)
        // @ts-ignore
        .then((response) => {
            let text = response.text /*response.data.choices[0].text*/ as string;

            // Save the result in the cache and store it in a JSON file
            cache[prompt] = text;
            fs.writeFileSync(cacheFile, JSON.stringify(cache));

            return text;
        })
        .catch((e) => {
            console.log(prompt);
            console.error(e);
            throw e.response.data;
        });
};
function getUserInput(prompt: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(prompt, (input) => {
            resolve(input);
            rl.close();
        });
    });
}
async function iterateDocument(context: string, prompt: string, parent: DocumentNode | null = null): Promise<DocumentNode> {
    const response = await queryChatGPT(`
    The following is a prompt: "${prompt}"
    
    Please use the following context when responding to the prompt: ${context}
`);

    // Create a new node for this document
    const newNode: DocumentNode = {
        document: response,
        context: context,
        prompt: prompt,
        children: [],
    }

    // If there is a parent node, add this node as its child
    if (parent) {
        parent.children.push(newNode);
    } else {
        // If not, this is a root node, so add it to the documentNodes array
        documentNodes.push(newNode);
    }

    // Check if the response contains a question
    const questionMatch = response.match(/{{(.*?)}}/);
    if (questionMatch) {
        const question = questionMatch[1];

        // Ask the user for additional context for the question
        const additionalContext = await getUserInput(`Please provide additional context for the question: ${question}`);

        // Recursively generate document for the question, with the additional context, and add it as a child of the current node
        await iterateDocument(additionalContext, question, newNode);
    }

    return newNode;
}
function saveToFile(filename: string): void {
    const jsonData = JSON.stringify(documentNodes, null, 2);
    fs.writeFileSync(filename, jsonData);
}
function loadFromFile(filename: string): void {
    const jsonData = fs.readFileSync(filename, 'utf-8');
    documentNodes = JSON.parse(jsonData);
}
function navigateTree(): void {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Enter the index of the document to navigate (or type exit to quit): ', (answer) => {
        if (answer === 'exit') {
            rl.close();
            return;
        }

        const index = parseInt(answer);
        if (index >= 0 && index < documentNodes.length) {
            console.log(`Document: ${documentNodes[index].document}`);
            console.log(`Context: ${documentNodes[index].context}`);
            console.log(`Prompt: ${documentNodes[index].prompt}`);
        } else {
            console.log('Invalid index, please try again.');
        }

        navigateTree();
    });
}
// Example usage:
async function main() {
    await iterateDocument(
        `
        Concerning a research project which answers the question "To what extent does China’s dual circulation strategy affect foreign pharmaceutical companies operating in China?" for a bachelors in international business in Asia. 
        For any part of my requests which requires more detail or outside information, leave a placeholder 
        {{Use the contents of the brackets to ask me for more information, like research papers, or just more detailed sections}}.
        Be EXTREMELY liberal with your placeholders.  
        I need each section to be extremely detailed and sourced, 
        so ANY points of ambiguity should be wrapped in these double curly braces and have a well formed question inside.
        
        `,
        `
        Generate me an exhaustive outline of the entire paper
        `
    );
    saveToFile('docTree.json');
    loadFromFile('docTree.json');
    navigateTree();
}
main();