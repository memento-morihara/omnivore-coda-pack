import * as coda from "@codahq/packs-sdk";

export const pack = coda.newPack();

// Uses the Authorization header with user's API key
// It's NOT a bearer token -- does not work with Bearer
pack.setUserAuthentication({
    type: coda.AuthenticationType.CustomHeaderToken,
    headerName: "Authorization"
});

pack.addNetworkDomain("api-prod.omnivore.app");

// GraphQL endpoint
const endpoint = "https://api-prod.omnivore.app/api/graphql";

const Label = coda.makeObjectSchema({
    properties: {
        id: { type: coda.ValueType.String },
        name: { type: coda.ValueType.String },
        color: { type: coda.ValueType.String },
        description: { type: coda.ValueType.String },
    },
    displayProperty: "name",
    idProperty: "id",
});

const Highlight = coda.makeObjectSchema({
    properties: {
        id: { type: coda.ValueType.String },
        quote: { type: coda.ValueType.String, codaType: coda.ValueHintType.Markdown },
        annotation: { type: coda.ValueType.String, codaType: coda.ValueHintType.Markdown },
        labels: { type: coda.ValueType.Array, items: Label }
    },
    displayProperty: "quote",
    idProperty: "id",
    subtitleProperties: ["labels"]
});

const Article = coda.makeObjectSchema({
    properties: {
        id: { type: coda.ValueType.String },
        title: { type: coda.ValueType.String },
        author: { type: coda.ValueType.String },
        slug: { type: coda.ValueType.String },
        description: { type: coda.ValueType.String },
        savedAt: { type: coda.ValueType.String, codaType: coda.ValueHintType.DateTime },
        readingProgressPercent: { type: coda.ValueType.Number, codaType: coda.ValueHintType.Percent },
        originalArticleUrl: { type: coda.ValueType.String, codaType: coda.ValueHintType.Url },
        labels: { type: coda.ValueType.Array, items: Label },
        highlights: { type: coda.ValueType.Array, items: Highlight }
    },
    displayProperty: "title",
    idProperty: "id",
    linkProperty: "originalArticleUrl",
    subtitleProperties: ["author", "labels", "readingProgressPercent"],
    snippetProperty: "description",
});

// --- Articles ---
pack.addSyncTable({
    name: "Articles",
    description: "Articles you've saved in Omnivore and their associated highlights and annotations.",
    identityName: "Article",
    schema: Article,
    formula: {
        name: "SyncArticles",
        description: "Retrieve articles from Omnivore.",
        parameters: [],
        execute: async function ([], context) {
            // cursor to fetch subsequent pages
            // uses endCursor from previous request via continuation or '0' if no previous
            let cursor = context.sync.continuation ?? '0';
            const requestBody = JSON.stringify({ "query": `{articles(sharedOnly:false, first: 10, after: "${cursor}"){... on ArticlesSuccess{edges{cursor node{id title slug author description savedAt readingProgressPercent originalArticleUrl labels{name, id}highlights(input:{includeFriends:false}){id quote type annotation labels{name}}}}pageInfo{hasNextPage endCursor totalCount}}... on ArticlesError{errorCodes}}}` });

            const response = await context.fetcher.fetch({
                method: "POST",
                url: endpoint,
                headers: {
                    "Content-Type": "application/json"
                },
                body: requestBody
            });

            // Set continuation to endCursor from the pageInfo object to get more results
            let continuation;
            if (response.body.data.articles.pageInfo.hasNextPage) {
                continuation = response.body.data.articles.pageInfo.endCursor;
            }
            // Change reading progress percent to be out of 1 instead of 100 (e.g. 80 -> 0.8)
            let articles = response.body.data.articles.edges.map((i) => { return { ...i.node, readingProgressPercent: i.node.readingProgressPercent / 100 } });

            return {
                result: articles,
                continuation: continuation
            };
            },
    },
});

// --- Labels ---
pack.addSyncTable({
    name: "Labels",
    description: "Your Omnivore labels.",
    identityName: "Label",
    schema: Label,
    formula: {
        name: "Labels",
        description: "Get user's labels from Omnivore.",
        parameters: [],
        execute: async function ([], context) {
            let response = await context.fetcher.fetch({
                method: "POST",
                url: endpoint,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "query": "{labels{... on LabelsSuccess{labels{id name color description}}}}" }),
            });

            // Extract label objects from graph nodes
            let labels = [];
            for (let item of response.body.data.labels.labels) {
                labels.push(item);
            }
            return {
                result: labels,
            };
            },
    },
});