const express = require('express');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const { google } = require('googleapis');
const path = require('path');

const args = process.argv.slice(2); 
const given_link = `${args[0]} `;  
const project_title= `${args[1]}`;

function isYoutubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?youtube\.com/.test(url);
}

function isInstructablesUrl(url) {
    return /^(https?:\/\/)?(www\.)?instructables\.com/.test(url);
}


function extractVideoId(url) {
    url = url.trim(); 
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/.*[?&]v=([^&#]*)/);
    return match ? match[1] : null;
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

        let loadMoreVisible = await isElementVisible(page, cssSelector); 
        while (loadMoreVisible) {
            await page.click(cssSelector).catch(() => {});
            loadMoreVisible = await isElementVisible(page, cssSelector);
        }

        const html = await page.evaluate(() => document.body.innerHTML);
        const $ = cheerio.load(html);

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
        
        await browser.close();

        const dir = `./results/${project_title}`;
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true }); 
        }
        const csvFilePath = `${dir}/${project_title}_ground_truth.csv`;

        const prepareCommentsForCsv = (comments) => {
            const flatComments = [];

            comments.forEach(comment => {
                flatComments.push({
                    project_title,
                    given_link,
                    commentID: comment.commentID,
                    authorName: comment.authorName,
                    commentText: comment.commentText,
                });

                comment.replies.forEach(reply => {
                    flatComments.push({
                        project_title,
                        given_link,
                        commentID: reply.commentID,
                        authorName: reply.authorName,
                        commentText: reply.commentText,
                    });
                });
            });

            return flatComments;
        };

        const flatCommentsForCsv = prepareCommentsForCsv(comments);
        const csvWriter = createObjectCsvWriter({
            path: csvFilePath,
            header: [
                {id:'project_title', title: 'Tutorial Title'},
                {id:'given_link', title: 'Tutorial Link'},
                {id:'commentID', title: 'Comment ID'},
                {id:'commentText', title: 'Comment Text'},
                {id:'authorName', title: 'Author'},
            ],
            fieldDelimiter: ';' 
        });
        
        await csvWriter.writeRecords(flatCommentsForCsv);
        console.log(`Data has been saved to ${csvFilePath}`);
    } catch (error) {
        console.error('Error fetching and parsing from Instructables:', error.message);
    }
};

const fetchInstructionsYoutube = async (videoId) => {
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
                    commentID,
                    authorName,
                    commentText,
                    replies,
                });
            });

            pageToken = response.data.nextPageToken ? response.data.nextPageToken : '';

        } catch (error) {
            console.error('Failed to fetch comments:', error);
            break;
        }
    } while (pageToken);


    const dir = path.join(__dirname, 'results', project_title);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Directory created: ${dir}`);
    } else {
        console.log(`Directory already exists: ${dir}`);
    }

    const csvFilePath = path.join(dir, `${project_title}_ground_truth.csv`);

    const flatCommentsForCsv = commentsData.flatMap(comment => [
        {
            project_title,
            given_link,
            commentID: comment.commentID,
            authorName: comment.authorName,
            commentText: comment.commentText,
        },
        ...comment.replies.map(reply => ({
            project_title,
            given_link,
            commentID: reply.commentID,
            authorName: reply.authorName,
            commentText: reply.commentText,
        }))
    ]);

    const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
            {id:'project_title', title: 'Tutorial Title'},
            {id:'given_link', title: 'Tutorial Link'},
            {id:'commentID', title: 'Comment ID'},
            {id:'commentText', title: 'Comment Text'},
            {id:'authorName', title: 'Author'},
        ],
        fieldDelimiter: ';'
    });

    await csvWriter.writeRecords(flatCommentsForCsv);
    console.log(`Data has been saved to ${csvFilePath}`);
};

if (isYoutubeUrl(given_link)) {
    console.log("Youtube")
    const videoId = extractVideoId(given_link);
    fetchInstructionsYoutube(videoId);
} else if (isInstructablesUrl(given_link)) {
    console.log("Instructables")
    fetchInstructionsInstructables(given_link);
} else {
    console.log("Nothing")
    res.status(400).send('Unsupported URL');
    return;
}





    