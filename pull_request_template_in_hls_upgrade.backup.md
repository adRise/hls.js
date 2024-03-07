## Which problem does this PR solve?

<< If this is a bug fix, please describe reproducible steps here, or paste the story link. >>

## Hls.js part

We are runing a hls.js upgrade experiment. It means we are maintaining two versions of hls.js at the same time. @adrise/hls.js corresponds to the master branch, and @adrise/hls.js-next corresponds to the hls.js-next branch. If you are trying to sync hls.js version with community, please refer to [this guide](https://www.notion.so/tubi/How-to-update-hls-js-package-version-21846b8122ce423f87cd4c01f4749127)

Which branch you are preparing to merge:
- [x] master
- [ ] hls.js-next

Which version of hls.js you would like to change?
- [ ] Only change hls.js. I want to merge this into master and don't affect hls.js-next.
- [x] Change both hls.js version. I will merge this change into both master and hls.js-next.
- [ ] No change to hls.js.

Which version of hls.js package would you like to release. 
>We will use [hls.js version]-rc.X for release on the `master` branch, such as 1.1.5-rc.1
You can create a new npm version on your branch if you need to deploy it to the npm for debugging. We will follow the same convention, such as 1.1.5-alpha.1
- [x] [hls.js version]-rc.X
- [ ] [hls.js version]-alpha.X

## Related documents/resources

<< Link to any documents or resources if any >>

## Suggested CR ordering of files?

<< Please order the files here for code review purposes >>

## How I tested it works

<< How have you verified the fix / correct functionality of the feature? Please bullet your test cases below, and don't use "tested locally" or "tested on staging". See https://tubitv.atlassian.net/wiki/x/TgB1Lw for more information. >>
