import { Text } from 'ink';
import React from 'react';
import { COLORS } from '../constants';

const openLink = `\x1b]8;;`;
const delimiter = `\x07`;
const closeLink = `\x1b]8;;\x07`;

export const Link = ({ url, children }: { url: string; children: string }) => {
    return <Text underline={true} color={COLORS.MARKDOWN_LINK}>{openLink}{url}{delimiter}{children}{closeLink}</Text>;
};