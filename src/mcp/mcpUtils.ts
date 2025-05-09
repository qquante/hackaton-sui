export interface McpToolOutput {
    content: [
        {
            type: "text"; 
            text: string; 
        }
    ];
    [key: string]: any;
}

export interface PreparedTransactionOutput {
    content: [
        {
            type: "text";
            text: string;
        }
    ];
    [key: string]: any;
} 