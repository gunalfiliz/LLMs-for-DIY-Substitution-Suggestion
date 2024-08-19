require('dotenv').config();
const express = require('express');
const fs = require('fs').promises; 
const app = express();
const port = 3000;
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const { google } = require('googleapis');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


app.use(express.static('public'));
app.use(express.json());


app.post('/clicked', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Received URL:', url);
        const respText = await restarted(url);
        console.log("it runs");
        console.log("respText: " + respText);
        if (respText === undefined)
            res.send("Undefined");
        else
            res.send(respText);
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});


const restarted = async (url) => {
    try {
        // for Instr, transcript might be empty
        const { url: processedUrl, title, transcript = "No transcript" } = await runPythonScript(url);
        if (isYoutubeUrl(url)) {
            await runVideoProcessing(title, url);
            console.log("Video processed");
        }
        const output = await runPlatform(title, url, transcript || "No transcript" );
        console.log("Output:", output);
        return output;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const runPythonScript = async (url) => {
    return new Promise((resolve, reject) => {
        const command = `python prep.py "${url}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error executing script:', error);
                reject(error);
                return;
            }
            if (stderr) {
                console.error('stderr:', stderr);
            }
            console.log('stdout:', stdout);

            // Attempt to parse JSON

            try {
                const data = JSON.parse(stdout);
                resolve(data);
            } catch (parseError) {
                console.error('Failed to parse JSON:', parseError);
                reject(parseError);
            }

        });
    });
};

const runVideoProcessing = async (title, url) => {
    return new Promise((resolve, reject) => {
        // Adjust the command to fit your environment
        const command = `python video_process.py "${title}" "${url}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error executing script:', error);
                reject(error);
                return;
            }
            if (stderr) {
                console.error('stderr:', stderr);
            }
            console.log('stdout:', stdout);

            resolve()
        });
    });
};

async function runPlatform(title, url, transcript) {
    try {
        let fetchDataFunc;
        let source;
        console.log('Platform selection')

        if (isYoutubeUrl(url)) {
            const videoId = extractVideoId(url);
            fetchDataFunc = () => fetchInstructionsYoutube(videoId, transcript, title);
            source = "YouTube";
        } else if (isInstructablesUrl(url)) {
            fetchDataFunc = () => fetchInstructionsInstructables(url);
            source = "Instructables";
        } else {
            throw new Error('Unsupported URL');
        }


        const respText = await requestChatGpt(source, fetchDataFunc);

        return respText || "Undefined";
    } catch (error) {
        console.error(error);
        throw new Error('An error occurred');
    }
}


function isYoutubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?youtube\.com/.test(url);
}

function isInstructablesUrl(url) {
    return /^(https?:\/\/)?(www\.)?instructables\.com/.test(url);
}

function extractVideoId(url) {
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/.*[?&]v=([^&#]*)/);
    return match ? match[1] : null;
}



async function requestChatGpt(source, fetchDataFunc) {
    try {
        console.log(`Request GPT for ${source}`);
        let { tutorial, imageUrls, base64Images } = await fetchDataFunc();
        const tutorialObj = JSON.parse(tutorial);

        const comments = JSON.parse(tutorialObj.comments);
        const instructions = JSON.parse(tutorialObj.instructions);

        let allResponses = [];

        // Step 1: Analyze images
        if (source === "YouTube") {
            const limitedBase64Images = base64Images ? base64Images.slice(0, 3) : [];
            const imageMessages = [
                { role: "system", content: `
                    Analyze the provided images and identify the materials, tools, and processes used in the project.
                ` },
                { 
                    role: 'user', 
                    content: [
                        { type: "text", text: "Analyze these images from the project instructions:" },
                        ...limitedBase64Images.map(base64Image => ({
                            type: "image_url",
                            image_url: { url: base64Image }
                        }))
                    ]
                }
            ];
            const imageResponse = await openai.chat.completions.create({
                messages: imageMessages,
                model: 'gpt-4o',
            });
            allResponses.push(imageResponse.choices[0].message.content);
        } else if (source === "Instructables") {
            let imageUrlsArray = Array.isArray(imageUrls) ? imageUrls : imageUrls.split(',').map(url => url.trim());
            const limitedImageUrls = imageUrlsArray.slice(0, 3);
            const imageMessages = [
                { role: "system", content: `
                    Analyze the provided images and identify the materials, tools, and processes used in the project.
                ` },
                { 
                    role: 'user', 
                    content: [
                        { type: "text", text: "Analyze these images from the project instructions:" },
                        ...limitedImageUrls.map(url => ({
                            type: "image_url",
                            image_url: { url: url }
                        }))
                    ]
                }
            ];
            const imageResponse = await openai.chat.completions.create({
                messages: imageMessages,
                model: 'gpt-4o',
            });
            allResponses.push(imageResponse.choices[0].message.content);
        }

        // Step 2: Analyze tutorial
        const instructionsText = tutorialObj.instructions;
        const tutorialMessages = [
            { role: "system", content: `
                Analyze the provided project instructions and identify the materials, tools, and processes mentioned.
            ` },
            { role: "user", content: "Analyze these project instructions:\n\n" + instructionsText }
        ];
        const tutorialResponse = await openai.chat.completions.create({
            messages: tutorialMessages,
            model: 'gpt-4o',
        });
        allResponses.push(tutorialResponse.choices[0].message.content);

        // Step 3: Analyze comments
        if (tutorialObj.comments) {
            const commentsText = tutorialObj.comments;
            const commentsChunks = splitTextIntoChunks(commentsText, 4000);
            const systemMessageForComments = `
                Analyze the provided comments and identify any substitution suggestions made by contributors regarding materials, tools, or processes used in the project.
                Format your response as follows:
                Comprehensive List of Materials and Tools with Substitution Suggestions:
                1. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID])
                2. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID])
                3. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID])
                ...
            `;
            for (let i = 0; i < commentsChunks.length; i++) {
                const commentsMessages = [
                    { role: "system", content: systemMessageForComments },
                    { role: "user", content: `Analyze these comments for substitution suggestions. ${i > 0 ? 'Continue from the previous analysis.' : ''}\n\n${commentsChunks[i]}` }
                ];
                const commentsResponse = await openai.chat.completions.create({
                    messages: commentsMessages,
                    model: 'gpt-4o',
                });
                allResponses.push(commentsResponse.choices[0].message.content);
            }
        }

        // Step 4: Combine and summarize all responses
        const finalMessages = [
            { role: "system", content: `
                Based on the previous analyses, provide a final comprehensive list of materials, tools, and processes used in the project if there is any identified substitution suggestions for them.
                Format the output as follows:        
                Comprehensive List of Materials, Tools and Processes with Substitution Suggestions:
                1. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID])
                2. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID])
                3. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID]) 
                ...

            ` },
            { role: "user", content: "Combine and summarize the analyses from the previous steps:\n\n" + allResponses.join("\n\n") }
        ];
        const finalResponse = await openai.chat.completions.create({
            messages: finalMessages,
            model: 'gpt-4o',
        });

        return finalResponse.choices[0].message.content;
    } catch (error) {
        console.error(`Error requesting GPT for ${source}:`, error);
        throw error;
    }
}


const fetchInstructionsInstructables = async (url) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url);
        const cssSelector = 'div._commentsActions_1af39_44 > button:first-of-type';
        const isElementVisible = async (page, cssSelector) => {
            let visible = true;
            await page
                .waitForSelector(cssSelector, { visible: true, timeout: 2000 })
                .catch(() => {
                    visible = false;
                });
            return visible;
        };

        

        let loadMoreVisible = await isElementVisible(page, 'div._commentsActions_1af39_44 > button:first-of-type'); 
        while (loadMoreVisible) {
            await page.click('div._commentsActions_1af39_44 > button:first-of-type').catch(() => {});
            loadMoreVisible = await isElementVisible(page, 'div._commentsActions_1af39_44 > button:first-of-type');
        }

        const html = await page.evaluate(() => document.body.innerHTML);
        const $ = cheerio.load(html);

        const instructions = $('section.step').map((index, element) => {
            const titleofStep = $(element).find('h2.step-title').text().trim();
            const descriptionofInstruction = $(element).find('.step-body').text().trim();
            return {
                titleofStep,
                descriptionofInstruction
            };
        }).get();

        const imageUrls = $('div.photoset-image a.gallery-link img').map((index, element) => $(element).attr('src')).get();

        const comments = $('#discuss > div._comments_1af39_8 > div._comment_147vy_1').map((index, element) => {
            const commentID = $(element).find('> div._comment_83cm4_11').attr('id');
            const authorName = $(element).find('> div._comment_83cm4_11 > div._content_83cm4_40 > div._meta_83cm4_48 div._user_83cm4_58 a').text().trim();
            const commentText = $(element).find('> div._comment_83cm4_11 > div._content_83cm4_40 > p').map((index, pElement) => $(pElement).text().trim()).get().join('\n');

            const replies = $(element).find('details._replies_w23yk_9 div._comments_w23yk_15 div._comment_83cm4_11').map((replyIndex, replyElement) => {
                const commentID = $(replyElement).attr('id');
                const authorName = $(replyElement).find('div._user_83cm4_58 a').text().trim();
                const commentText = $(replyElement).find('div._content_83cm4_40 p').map((index, pElement) => $(pElement).text().trim()).get().join('\n');
        
                return {
                    commentID,
                    authorName,
                    commentText,
                };
            }).get();
        
            return {
                commentID,
                authorName,
                commentText,
                replies,
            };
        }).get();
        
        const instructions_str = JSON.stringify(instructions);
        const comments_str = JSON.stringify(comments);
        // const imageUrls_str = JSON.stringify(imageUrls);


        const tutorial = JSON.stringify({comments: comments_str,  instructions: instructions_str});
        console.log(tutorial);
        const URLs = JSON.stringify(imageUrls)
        console.log(URLs);
        await browser.close();
        return { tutorial, imageUrls};
    } catch (error) {
        console.error('Error fetching and parsing from Instructables:', error.message);
        return { tutorial: undefined };
    }
};

const fetchInstructionsYoutube = async (videoId, transcript, title) => {
    try {
        const dataUrlsFilePath = `video_images/${title}/${title}_data_urls.txt`; 
        const imageUrls = await fs.readFile(dataUrlsFilePath, 'utf-8');

        const youtube = google.youtube({
            version: 'v3',
            auth: process.env.YOUTUBE_API_KEY,
        });

        let pageToken = '';
        let commentsData = [];

        do {
            try {
                const response = await youtube.commentThreads.list({
                    part: "snippet,replies",
                    videoId: videoId,
                    textFormat: "plainText",
                    pageToken: pageToken,
                    maxResults: 100, 
                });

                response.data.items.forEach(item => {
                    const commentID = item.snippet.topLevelComment.id;
                    const commentText = item.snippet.topLevelComment.snippet.textDisplay;
                    const authorName = item.snippet.topLevelComment.snippet.authorDisplayName;
                    const replies = item.replies ? item.replies.comments.map(reply => ({
                        commentID: reply.id, 
                        authorName: reply.snippet.authorDisplayName,
                        commentText: reply.snippet.textDisplay
                    })) : [];
                    commentsData.push({
                        commentID: commentID,
                        authorName: authorName,
                        commentText: commentText,
                        replies: replies,
                    });
                });

                pageToken = response.data.nextPageToken ? response.data.nextPageToken : '';
            } catch (error) {
                console.error('Failed to fetch comments:', error);
                break; 
            }
        } while (pageToken);

        const comments_str = JSON.stringify(commentsData);
        const instructions = [{descriptionofInstruction: transcript }];

        const instructions_str = JSON.stringify(instructions);
        const tutorial = JSON.stringify({ comments: comments_str, instructions: instructions_str });

        return { tutorial, imageUrls};
    } catch (error) {
        console.error('Error fetching and parsing from YouTube:', error.message);
        return { tutorial: undefined };
    }
};

function splitTextIntoChunks(text, chunkSize) {
    const words = text.split(' ');
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    for (let word of words) {
        if (currentSize + word.length > chunkSize) {
            chunks.push(currentChunk.join(' '));
            currentChunk = [];
            currentSize = 0;
        }
        currentChunk.push(word);
        currentSize += word.length + 1; 
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }
    return chunks;
}
